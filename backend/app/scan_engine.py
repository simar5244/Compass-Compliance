"""Unified render-based crawl + audit loop.

Replaces the old crawl-then-score split. Discovery and auditing happen in the
SAME browser visit: a worker pops a URL from the shared frontier, renders it to
a stable state (app.render), runs axe-core + captures artifacts on that live DOM
(app.audit), and pushes newly discovered same-site links back to the frontier.
When the frontier drains, the scoring engine aggregates everything.

There is exactly one code path for every page — static HTML and SPAs alike.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone

import httpx
from playwright.async_api import async_playwright
from sqlalchemy import delete, func, select

from app.audit.content_checks import finding_to_record
from app.audit.links import LinkStatus, broken_link_findings, check_links
from app.audit.accessibility_scope import INSPECTOR_ONLY_ALIAS_RULES
from app.audit.lighthouse import capture_web_vitals
from app.audit.sitemap_checks import run_sitemap_checks
from app.audit.ttu_freshness_checks import stale_content_record
from app.audit.ttu_sb17_checks import run_ttu_sb17_checks
from app.config import settings
from app.crawl.frontier import Frontier
from app.crawl.normalize import document_extension, normalize_url
from app.crawl.ignore import IgnoreMatcher
from app.crawl.robots_sitemap import RobotsTxt, default_sitemap_url, fetch_sitemap_urls
from app.db import async_session
from app.audit.policy_checks import load_default_policy_rules
from app.models import ApprovedGrammar, CheckScoreRow, IgnoredGrammarRule, Issue, Page, Scan, Site
from app.page_pipeline import audit_page
from app.pdf_worker import process_pdfs
from app.ratelimit import DomainRateLimiter
from app.render.capture import DESKTOP_VIEWPORT
from app.render.worker import DESKTOP_USER_AGENT, RenderConfig
from app.scoring.config import load_scoring_config
from app.scoring.engine import PageAudit, ScoredIssue, compute_page_score, compute_site_scores

logger = logging.getLogger("wcag_scanner.scan_engine")
_INSPECTOR_ONLY_ACCESSIBILITY_RULES = INSPECTOR_ONLY_ALIAS_RULES


@dataclass
class PageContext:
    """What the finalize step needs to add cross-page findings (broken links,
    duplicate title/meta) after the crawl and rescore the affected pages."""
    page_id: uuid.UUID
    url: str
    is_error_page: bool
    title: str
    meta_description: str | None
    outbound_links: list[str]
    outbound_link_occurrences: list[dict] = field(default_factory=list)
    #: every anchor on the page, internal and external, for broken-link checking
    link_occurrences: list[dict] = field(default_factory=list)
    scored: list[ScoredIssue] = field(default_factory=list)
    main_text: str = ""


def _scored_from_record(rec: dict) -> ScoredIssue:
    return ScoredIssue(
        rule_id=rec["rule_id"], impact=rec["impact"],
        category=rec.get("category", "accessibility"), subcategory=rec.get("subcategory"),
        weight=rec.get("weight", 1.0),
        wcag_level=rec["wcag_level"], wcag_version=rec["wcag_version"],
        is_best_practice=rec["is_best_practice"],
        criterion_id=rec["criterion_id"], criterion_name=rec["criterion_name"],
    )


def _is_ignored_grammar_record(rec: dict) -> bool:
    return rec.get("rule_id") == "grammar" and rec.get("manual_review") is False and rec.get("reviewed") is True


def _is_site_scored_record(rec: dict) -> bool:
    return not rec["manual_review"] and rec.get("rule_id") not in _INSPECTOR_ONLY_ACCESSIBILITY_RULES


async def run_scan(scan_id: str) -> None:
    """Top-level job entrypoint: never lets an exception escape without marking failed."""
    try:
        await _run(scan_id)
    except Exception as exc:  # noqa: BLE001 - job guard
        logger.exception("Scan %s failed", scan_id)
        async with async_session() as session:
            scan = await session.get(Scan, uuid.UUID(scan_id))
            if scan:
                scan.status = "failed"
                scan.error = str(exc)[:1000]
                scan.finished_at = datetime.now(timezone.utc)
                await session.commit()


async def _run(scan_id: str) -> None:
    scan_uuid = uuid.UUID(scan_id)
    await _clear_scan_results(scan_uuid)

    async with async_session() as session:
        scan = await session.get(Scan, scan_uuid)
        if scan is None:
            return
        root_url = scan.root_url
        max_pages = scan.max_pages
        max_depth = scan.max_depth
        pool_size = scan.render_pool_size or settings.render_pool_size
        ignore_patterns = list(scan.ignore_patterns or [])
        custom_dict = {w for w in (scan.custom_dictionary or []) if isinstance(w, str)}
        # Site-wide grammar suppressions (empty for instant scans with no site).
        grammar_approved: set[str] = set()
        grammar_ignored: set[str] = set()
        if scan.site_id is not None:
            grammar_approved = set((await session.execute(
                select(ApprovedGrammar.error_text).where(ApprovedGrammar.site_id == scan.site_id)
            )).scalars().all())
            grammar_ignored = set((await session.execute(
                select(IgnoredGrammarRule.rule_id).where(IgnoredGrammarRule.site_id == scan.site_id)
            )).scalars().all())
        # Policy keyword rules: the site's own, else the built-in defaults.
        policy_rules = load_default_policy_rules()
        if scan.site_id is not None:
            site_row = await session.get(Site, scan.site_id)
            if site_row and site_row.policy_rules:
                policy_rules = site_row.policy_rules
        scan.status = "crawling"
        scan.started_at = datetime.now(timezone.utc)
        scan.last_progress_at = scan.started_at
        await session.commit()

    render_cfg = RenderConfig(
        goto_timeout_ms=settings.goto_timeout_ms,
        quiet_ms=settings.stability_quiet_ms,
        stability_ceiling_ms=settings.stability_ceiling_ms,
    )
    rate_limiter = DomainRateLimiter(settings.politeness_delay_ms / 1000.0)
    ignore = IgnoreMatcher.with_defaults(ignore_patterns)

    # --- seed the frontier: robots.txt + sitemap.xml are the ONLY plain-HTTP fetches ---
    async with httpx.AsyncClient(timeout=15, follow_redirects=True,
                                 headers={"User-Agent": DESKTOP_USER_AGENT}) as http:
        robots = await RobotsTxt.fetch(root_url, http)
        if settings.respect_robots and not robots.can_fetch(root_url):
            await _fail(scan_uuid, "robots.txt disallows crawling the start URL")
            return

        frontier = Frontier(
            root_url, robots=robots, ignore=ignore,
            max_pages=max_pages, max_depth=max_depth,
            max_documents=settings.crawl_max_documents_default,
            respect_robots=settings.respect_robots,
        )
        seeds = [root_url]
        sitemap_sources = list(robots.sitemap_urls) or [default_sitemap_url(root_url)]
        for sm in sitemap_sources:
            seeds.extend(await fetch_sitemap_urls(sm, http))
        await frontier.seed(seeds)

    logger.info("Scan %s seeded frontier with %d URLs", scan_id, frontier.seen_count)

    progress = {"crawled": 0, "errored": 0}
    progress_lock = asyncio.Lock()
    page_contexts: list[PageContext] = []

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()

        async def process(item_url: str, depth: int) -> None:
            await rate_limiter.acquire(item_url)
            context = await browser.new_context(
                viewport=DESKTOP_VIEWPORT, user_agent=DESKTOP_USER_AGENT
            )
            try:
                audited = await audit_page(context, item_url, render_cfg, custom_dict, root_url,
                                           grammar_approved, grammar_ignored, policy_rules)
                if not audited.ok:
                    await _persist_errored_page(scan_uuid, item_url, depth, audited.error)
                    async with progress_lock:
                        progress["errored"] += 1
                    return

                page_id = await _persist_page(scan_uuid, item_url, depth, audited)

                # feed discovery back into the shared frontier
                if depth < max_depth and not frontier.budget_reached():
                    for link in audited.links:
                        await frontier.add(link, depth + 1, base=audited.final_url or item_url)

                # accumulate for finalize (scoring and cross-page checks)
                scored = [_scored_from_record(r) for r in audited.records if _is_site_scored_record(r)]
                ctx = PageContext(
                    page_id=page_id, url=item_url, is_error_page=audited.is_error_page,
                    title=audited.title, meta_description=audited.meta_description,
                    outbound_links=audited.external_links,
                    outbound_link_occurrences=audited.external_link_occurrences,
                    link_occurrences=audited.link_occurrences,
                    scored=scored,
                    main_text=audited.main_text,
                )
                async with progress_lock:
                    progress["crawled"] += 1
                    page_contexts.append(ctx)
            finally:
                await context.close()
                await _update_progress(scan_uuid, progress, frontier)

        async def worker() -> None:
            while True:
                item = await frontier.get()
                try:
                    if frontier.budget_reached() and progress["crawled"] >= max_pages:
                        continue
                    await process(item.url, item.depth)
                except Exception:  # noqa: BLE001 - a single page must not kill the worker
                    logger.exception("Unexpected error processing %s", item.url)
                    async with progress_lock:
                        progress["errored"] += 1
                finally:
                    frontier.task_done()

        workers = [asyncio.create_task(worker()) for _ in range(pool_size)]
        await frontier.join()
        for w in workers:
            w.cancel()
        await asyncio.gather(*workers, return_exceptions=True)
        await browser.close()

    # Group D: every linked document becomes a document row. PDFs are additionally
    # fetched and accessibility-checked; other formats are inventoried only.
    try:
        documents = sorted(frontier.document_urls)
        pdfs = [u for u in documents if document_extension(u) == ".pdf"]
        others = [u for u in documents if document_extension(u) != ".pdf"]

        checked: set[str] = set()
        for pdf_url, pdf_records, doc_title, doc_words, doc_sentences in await process_pdfs(pdfs):
            await _persist_document(
                scan_uuid, pdf_url, pdf_records, doc_title, doc_words, doc_sentences
            )
            checked.add(pdf_url)
        # A document that could not be fetched or parsed still belongs to the site.
        for url in [u for u in pdfs if u not in checked] + others:
            await _persist_document(scan_uuid, url, [])

        if documents:
            logger.info(
                "Scan %s recorded %d document(s), %d PDF(s) accessibility-checked",
                scan_id, len(documents), len(checked),
            )
    except Exception:  # document processing must never fail the scan
        logger.exception("Document processing failed for scan %s", scan_id)

    await _finalize(scan_uuid, page_contexts)


# --------------------------------------------------------------------------- #
# persistence helpers
# --------------------------------------------------------------------------- #

async def _fail(scan_uuid: uuid.UUID, message: str) -> None:
    async with async_session() as session:
        scan = await session.get(Scan, scan_uuid)
        if scan:
            scan.status = "failed"
            scan.error = message
            scan.finished_at = datetime.now(timezone.utc)
            await session.commit()


async def _persist_document(
    scan_uuid: uuid.UUID,
    doc_url: str,
    records: list[dict],
    doc_title: str | None = None,
    word_count: int | None = None,
    sentence_count: int | None = None,
) -> None:
    """Store a linked document as a document row (is_document=True).

    PDFs arrive with their Group D findings; other formats are inventoried with
    none. All PDF checks are assisted (manual_review), so documents aren't scored.
    """
    async with async_session() as session:
        page = Page(
            scan_id=scan_uuid, url=doc_url, normalized_url=doc_url, depth=0,
            render_status="ok", is_document=True,
            # The PDF's own title is what a reader sees; fall back to the filename.
            title=((doc_title or "").strip() or doc_url.rsplit("/", 1)[-1])[:255],
            word_count=word_count, sentence_count=sentence_count,
            issue_count=0, manual_review_count=len(records),
            scanned_at=datetime.now(timezone.utc),
        )
        session.add(page)
        await session.flush()
        for r in records:
            session.add(_issue_from_record(scan_uuid, page.id, r))
        await session.commit()


async def _persist_errored_page(scan_uuid: uuid.UUID, url: str, depth: int, error: str | None) -> None:
    async with async_session() as session:
        session.add(Page(
            scan_id=scan_uuid, url=url, normalized_url=url, depth=depth,
            render_status="error", error=(error or "render failed")[:500],
            scanned_at=datetime.now(timezone.utc),
        ))
        await session.commit()


async def _site_page_rules(session, site_id: uuid.UUID) -> tuple[set[str], set[str]]:
    site = await session.get(Site, site_id)
    if site is None:
        return set(), set()
    included = {
        normalize_url(u, site.root_url)
        for u in (site.included_page_urls or [])
        if isinstance(u, str)
    }
    removed = {
        normalize_url(u, site.root_url)
        for u in (site.removed_page_urls or [])
        if isinstance(u, str)
    }
    return included, removed


async def _site_page_rules(session, site_id: uuid.UUID) -> tuple[set[str], set[str]]:
    site = await session.get(Site, site_id)
    if site is None:
        return set(), set()
    included = {
        normalize_url(u, site.root_url)
        for u in (site.included_page_urls or [])
        if isinstance(u, str)
    }
    removed = {
        normalize_url(u, site.root_url)
        for u in (site.removed_page_urls or [])
        if isinstance(u, str)
    }
    return included, removed


async def _site_page_rules(session, site_id: uuid.UUID) -> tuple[set[str], set[str]]:
    site = await session.get(Site, site_id)
    if site is None:
        return set(), set()
    included = {normalize_url(u, site.root_url) for u in (site.included_page_urls or []) if isinstance(u, str)}
    removed = {normalize_url(u, site.root_url) for u in (site.removed_page_urls or []) if isinstance(u, str)}
    return included, removed


def _attach_refs(screenshots_meta: dict, refs: dict) -> dict:
    """Merge artifact refs into the per-viewport metadata dict."""
    key_map = {"desktop": "desktop_screenshot", "mobile": "mobile_screenshot", "narrow": "narrow_screenshot"}
    out: dict = {}
    for vp, meta in screenshots_meta.items():
        ref = refs.get(key_map.get(vp, ""))
        if ref:
            out[vp] = {**meta, "ref": ref}
    return out


async def _clear_scan_results(scan_uuid: uuid.UUID) -> None:
    """Drop anything a previous attempt at this scan stored.

    A crawl always restarts from the seed, so a retried job (worker restart, arq
    re-delivery) re-renders every page and would append a second row per URL.
    That is how one scan ended up with 1,314 page rows for 549 URLs, inflating
    every page count derived from them.
    """
    async with async_session() as session:
        existing = (await session.execute(
            select(Page.id).where(Page.scan_id == scan_uuid)
        )).scalars().all()
        if not existing:
            return
        await session.execute(delete(Issue).where(Issue.scan_id == scan_uuid))
        await session.execute(delete(CheckScoreRow).where(CheckScoreRow.scan_id == scan_uuid))
        await session.execute(delete(Page).where(Page.scan_id == scan_uuid))
        await session.commit()
    logger.info("Scan %s: cleared %d page row(s) from a previous attempt", scan_uuid, len(existing))


async def _persist_page(scan_uuid: uuid.UUID, url: str, depth: int, audited) -> uuid.UUID:
    from app.storage.artifacts import save_page_artifacts  # local import avoids cycle at import time

    cfg = load_scoring_config()
    records = audited.records
    manual = sum(1 for r in records if r["manual_review"])
    scored_issues = [_scored_from_record(r) for r in records if _is_site_scored_record(r)]
    page_scores = compute_page_score(
        PageAudit(key=url, issues=scored_issues, is_error_page=audited.is_error_page), cfg
    )

    async with async_session() as session:
        page_row = Page(
            scan_id=scan_uuid, url=url, normalized_url=url, depth=depth,
            render_status="ok", status_code=audited.status_code, final_url=audited.final_url,
            title=audited.title, meta_description=audited.meta_description,
            content_hash=audited.content_hash, render_unstable=audited.render_unstable,
            stability_reason=audited.stability_reason, cookie_rule=audited.cookie_rule,
            render_ms=audited.render_ms, attempts=audited.attempts, is_error_page=audited.is_error_page,
            word_count=audited.word_count, sentence_count=audited.sentence_count,
            reading_age=audited.reading_age,
            score=page_scores["score"], score_a=page_scores["score_a"],
            score_aa=page_scores["score_aa"], score_aaa=page_scores["score_aaa"],
            issue_count=len(records) - manual, manual_review_count=manual,
            scanned_at=datetime.now(timezone.utc),
        )
        session.add(page_row)
        await session.flush()  # need page_row.id for artifacts + issues

        refs = await save_page_artifacts(
            str(scan_uuid), str(page_row.id),
            desktop_png=audited.desktop_png, mobile_png=audited.mobile_png,
            narrow_png=audited.narrow_png, serialized_dom=audited.serialized_dom,
        )
        page_row.desktop_screenshot_ref = refs["desktop_screenshot"]
        page_row.mobile_screenshot_ref = refs["mobile_screenshot"]
        page_row.narrow_screenshot_ref = refs["narrow_screenshot"]
        page_row.dom_ref = refs["dom"]
        page_row.screenshots = _attach_refs(audited.screenshots_meta, refs)

        for r in records:
            session.add(_issue_from_record(scan_uuid, page_row.id, r, audited.screenshots_meta))
        await session.commit()
        return page_row.id


def _issue_from_record(
    scan_uuid: uuid.UUID, page_id: uuid.UUID, r: dict, screenshots_meta: dict | None = None
) -> Issue:
    viewport = r.get("viewport")
    bbox = r.get("bbox")
    if isinstance(bbox, dict):
        meta = screenshots_meta.get(viewport) if (viewport and isinstance(screenshots_meta, dict)) else None
        if isinstance(meta, dict):
            bbox = {
                **bbox,
                "viewport": bbox.get("viewport") or viewport,
                "captured_css_width": bbox.get("captured_css_width") or meta.get("css_width"),
                "captured_page_width": bbox.get("captured_page_width") or meta.get("page_width_px"),
                "captured_page_height": bbox.get("captured_page_height") or meta.get("page_height_px"),
                "captured_dpr": bbox.get("captured_dpr") or meta.get("dpr"),
            }
    return Issue(
        scan_id=scan_uuid, page_id=page_id,
        rule_id=r["rule_id"], category=r.get("category", "accessibility"),
        subcategory=r.get("subcategory"), impact=r["impact"], description=r["description"],
        remediation=r["remediation"], reference_url=r["reference_url"],
        wcag_version=r["wcag_version"], wcag_level=r["wcag_level"],
        criterion_id=r["criterion_id"], criterion_name=r["criterion_name"],
        is_best_practice=r["is_best_practice"], manual_review=r["manual_review"],
        wcag_tags=r.get("wcag_tags", []), selector=r["selector"], leaf_selector=r.get("leaf_selector"),
        html_snippet=r["html_snippet"], bbox=bbox, viewport=viewport,
    )


async def _append_issues_and_rescore(
    scan_uuid: uuid.UUID, ctx: PageContext, extra_records: list[dict], cfg
) -> None:
    """Insert post-crawl issue rows (broken links / duplicates) for a page and
    update that page's stored score to reflect them."""
    page_scores = compute_page_score(
        PageAudit(key=ctx.url, issues=ctx.scored, is_error_page=ctx.is_error_page), cfg
    )
    async with async_session() as session:
        page = await session.get(Page, ctx.page_id)
        shots = page.screenshots if page else None
        desktop_meta = shots.get("desktop") if isinstance(shots, dict) else None
        for r in extra_records:
            bbox = r.get("bbox")
            viewport = r.get("viewport")
            if isinstance(bbox, dict) and isinstance(desktop_meta, dict):
                bbox = {
                    **bbox,
                    "viewport": bbox.get("viewport") or viewport or "desktop",
                    "captured_css_width": bbox.get("captured_css_width") or desktop_meta.get("css_width"),
                    "captured_page_width": bbox.get("captured_page_width") or desktop_meta.get("page_width_px"),
                    "captured_page_height": bbox.get("captured_page_height") or desktop_meta.get("page_height_px"),
                    "captured_dpr": bbox.get("captured_dpr") or desktop_meta.get("dpr"),
                }
            session.add(Issue(
                scan_id=scan_uuid, page_id=ctx.page_id,
                rule_id=r["rule_id"], category=r.get("category", "content"),
                subcategory=r.get("subcategory"), impact=r["impact"], description=r["description"],
                remediation=r["remediation"], reference_url=r["reference_url"],
                wcag_version=None, wcag_level=None, criterion_id=None, criterion_name=None,
                is_best_practice=False, manual_review=False, wcag_tags=[],
                selector=r["selector"], leaf_selector=None, html_snippet=r["html_snippet"],
                bbox=bbox, viewport=viewport or "desktop" if bbox else None,
            ))
        if page:
            page.score = page_scores["score"]
            page.score_a = page_scores["score_a"]
            page.score_aa = page_scores["score_aa"]
            page.score_aaa = page_scores["score_aaa"]
            page.issue_count = page.issue_count + len(extra_records)
        await session.commit()


async def _update_progress(scan_uuid: uuid.UUID, progress: dict, frontier: Frontier) -> None:
    async with async_session() as session:
        scan = await session.get(Scan, scan_uuid)
        if scan:
            scan.pages_crawled = progress["crawled"]
            scan.pages_errored = progress["errored"]
            scan.pages_queued = frontier.qsize()
            scan.last_progress_at = datetime.now(timezone.utc)
            await session.commit()


def _coverage_verdict(audited: int, errored: int) -> tuple[str, str | None]:
    """Decide a finished scan's status from how many pages were actually audited.

    A scan that audited nothing must not report "done": every score is computed
    over the pages that succeeded, so an empty set scores as a clean site. That
    is what let a crawl whose seed page timed out finish as a healthy report.
    Returns ``(status, error)``; ``error`` is None for a normal finish.
    """
    if audited > 0:
        return "done", None
    if errored > 0:
        return "failed", (
            f"no pages could be audited ({errored} attempted, all failed); "
            "no score was produced"
        )
    return "failed", "no pages were crawled; no score was produced"


def _dup_title_finding(title: str) -> dict:
    return {
        "check_id": "page-title", "category": "content", "subcategory": "Page information", "impact": "moderate",
        "description": "Duplicate page title",
        "remediation": "Give each page a unique <title>; duplicates hurt search results and make pages "
                       "hard to tell apart.",
        "selector": None, "html_snippet": title, "weight": 1.0,
    }



#: Scans are reclaimed only after they have been silent for longer than a job
#: can possibly live. arq kills a job at ``job_timeout`` (30 minutes), so a
#: heartbeat older than that plus a margin proves no worker is still on it —
#: which keeps this safe even when several workers share the queue.
STALLED_SCAN_GRACE = timedelta(minutes=35)

#: States that only advance while a worker is actively running the job.
_RUNNING_STATES = ("pending", "crawling", "scoring")


async def reclaim_stalled_scans(grace: timedelta = STALLED_SCAN_GRACE) -> int:
    """Fail scans abandoned by a worker that died mid-run.

    A crawl that loses its worker leaves the row in a running state forever: it
    never reaches the finalize path, so the coverage guard there never sees it,
    and the dashboard shows a scan that is permanently in progress. Returns the
    number reclaimed.
    """
    cutoff = datetime.now(timezone.utc) - grace
    reclaimed = 0
    async with async_session() as session:
        rows = (await session.execute(
            select(Scan).where(Scan.status.in_(_RUNNING_STATES))
        )).scalars().all()
        for scan in rows:
            # Fall back through the timestamps: a scan that died before its
            # first heartbeat still has a creation time.
            last_seen = scan.last_progress_at or scan.started_at or scan.created_at
            if last_seen is None or last_seen > cutoff:
                continue
            previous_status = scan.status
            scan.status = "failed"
            scan.error = (
                "scan was abandoned — no progress for over "
                f"{int(grace.total_seconds() // 60)} minutes, so the worker "
                "running it is gone"
            )
            scan.finished_at = datetime.now(timezone.utc)
            reclaimed += 1
            logger.warning(
                "Reclaimed stalled scan %s (was %s, last progress %s)",
                scan.id, previous_status, last_seen,
            )
        if reclaimed:
            await session.commit()
    return reclaimed


async def _finalize(scan_uuid: uuid.UUID, page_contexts: list[PageContext]) -> None:
    from collections import Counter

    cfg = load_scoring_config()

    async with async_session() as session:
        scan = await session.get(Scan, scan_uuid)
        scan.status = "scoring"
        scan.last_progress_at = datetime.now(timezone.utc)
        await session.commit()

    # --- broken links (post-crawl) ---
    # Every distinct linked URL is requested once, then failures are attributed
    # back to each page that references them. Internal links are included: a link
    # to a moved page or a missing PDF is broken regardless of whose host it is.
    link_statuses: dict[str, LinkStatus] = {}
    unique_links = {
        occ["url"]
        for ctx in page_contexts
        for occ in ctx.link_occurrences
        if isinstance(occ, dict) and isinstance(occ.get("url"), str)
    }
    if unique_links:
        try:
            link_statuses = await check_links(
                unique_links,
                concurrency=settings.link_check_concurrency,
                user_agent=DESKTOP_USER_AGENT,
            )
            broken = sum(1 for status in link_statuses.values() if not status.ok)
            logger.info(
                "Scan %s checked %d unique link(s), %d broken", scan_uuid, len(unique_links), broken,
            )
        except Exception:  # link checking must never fail the scan
            logger.exception("Link checking failed for scan %s", scan_uuid)

    # --- cross-page + network quality checks (post-crawl) ---
    titles = Counter(c.title for c in page_contexts if c.title)

    for ctx in page_contexts:
        extra_findings = []
        if ctx.title and titles[ctx.title] > 1:
            extra_findings.append(_dup_title_finding(ctx.title))
        if link_statuses and ctx.link_occurrences:
            extra_findings.extend(broken_link_findings(ctx.link_occurrences, link_statuses))
        if not extra_findings:
            continue
        extra_records = [finding_to_record(f) for f in extra_findings]
        ctx.scored.extend(_scored_from_record(r) for r in extra_records)
        await _append_issues_and_rescore(scan_uuid, ctx, extra_records, cfg)

    # --- site-level sitemap checks (E1-E3) ---
    await _finalize_sitemap_checks(scan_uuid, page_contexts, cfg)

    # --- site scoring from every issue persisted for this scan ---
    _pages, page_audits = await _load_page_audits(scan_uuid)
    site = compute_site_scores(page_audits, cfg)

    async with async_session() as session:
        # persist per-check scores
        for c in site.checks:
            session.add(CheckScoreRow(
                scan_id=scan_uuid, rule_id=c.rule_id, category=c.category, subcategory=c.subcategory,
                criterion_id=c.criterion_id, criterion_name=c.criterion_name,
                wcag_version=c.wcag_version, wcag_level=c.wcag_level,
                is_best_practice=c.is_best_practice, pages_affected=c.pages_affected,
                avg_issues=c.avg_issues, pct_affected=c.pct_affected,
                check_score=c.check_score, penalty=c.penalty,
            ))

        scan = await session.get(Scan, scan_uuid)
        scan.overall_score = site.overall
        scan.overall_band = site.band
        scan.accessibility_score = site.accessibility
        scan.wcag_scores = site.wcag
        scan.category_scores = site.category_scores
        scan.score_a = site.wcag.get("wcag-22-a")
        scan.score_aa = site.wcag.get("wcag-22-aa")
        scan.score_aaa = site.wcag.get("wcag-22-aaa")

        # Web Vitals: measure the site's front door as each kind of visitor. Best
        # effort like the aggregates below — a vitals run that fails or times out
        # must never fail the scan.
        try:
            root_url = (await session.get(Site, scan.site_id)).root_url if scan.site_id else None
            if root_url:
                experiences = await capture_web_vitals(root_url)
                if experiences:
                    scan.metrics = {**(scan.metrics or {}), "web_vitals": experiences}
        except Exception:
            logger.warning("web vitals capture failed for scan %s", scan_uuid, exc_info=True)

        # Platform dashboards: store a minimal set of numeric aggregates in Scan.metrics.
        # These are best-effort and should never fail a scan.
        try:
            # Totals/means computed from persisted Page rows (render_status=ok).
            page_rows = list((await session.execute(
                select(Page.word_count, Page.reading_age, Page.sentence_count)
                .where(Page.scan_id == scan_uuid, Page.render_status == "ok")
            )).all())
            words = [int(w or 0) for (w, _age, _sentences) in page_rows]
            ages = [float(a) for (_w, a, _sentences) in page_rows if a is not None]
            sentences = [int(n or 0) for (_w, _age, n) in page_rows]
            scan.metrics = {
                **(scan.metrics or {}),
                "total_word_count": int(sum(words)),
                "total_sentence_count": int(sum(sentences)),
                "pages_measured": len(page_rows),
                "avg_reading_age": (sum(ages) / len(ages)) if ages else None,
            }
        except Exception:
            pass

        # Coverage. Pages that errored contribute zero findings, so a scan that
        # lost pages scores as though those pages were clean. Recount from the
        # persisted rows (authoritative — the in-flight progress counter can lag
        # a worker restart) and record what was missed, so a consumer can tell a
        # complete scan from one that silently skipped pages.
        coverage = dict((await session.execute(
            select(Page.render_status, func.count())
            .where(Page.scan_id == scan_uuid)
            .group_by(Page.render_status)
        )).all())
        audited = int(coverage.get("ok", 0))
        errored = int(sum(v for k, v in coverage.items() if k != "ok"))
        scan.pages_errored = errored

        if errored:
            failed = list((await session.execute(
                select(Page.url, Page.error)
                .where(Page.scan_id == scan_uuid, Page.render_status != "ok")
                .order_by(Page.url)
            )).all())
            reasons = Counter((err or "unknown").strip()[:120] for _url, err in failed)
            scan.metrics = {
                **(scan.metrics or {}),
                "incomplete": {
                    "pages_audited": audited,
                    "pages_failed": errored,
                    "reasons": dict(reasons),
                    # Bounded: the Page rows remain the full record.
                    "sample_urls": [u for u, _e in failed[:20]],
                },
            }
            logger.warning(
                "scan %s finished with %d of %d pages unaudited; scores cover only the "
                "%d that succeeded. reasons=%s",
                scan_uuid, errored, audited + errored, audited, dict(reasons),
            )

        scan.status, coverage_error = _coverage_verdict(audited, errored)
        if coverage_error:
            scan.error = coverage_error
            # Scoring over an empty set yields a perfect score. Leaving that in
            # place would show a flawless report to anything that reads the
            # score without checking status, which is the failure this guard
            # exists to prevent.
            scan.overall_score = None
            scan.overall_band = None
            scan.accessibility_score = None
            scan.wcag_scores = {}
            scan.category_scores = {}
            scan.score_a = scan.score_aa = scan.score_aaa = None
            logger.error("scan %s audited zero pages — marking failed: %s", scan_uuid, coverage_error)
        scan.finished_at = datetime.now(timezone.utc)
        site_id = scan.site_id
        await session.commit()

    # Platform history: content-change detection + run-diff vs the previous run.
    if site_id is not None:
        await _finalize_site_history(scan_uuid, site_id)

    # TTU Compliance finalize checks — must run after _finalize_site_history.
    # That step is what populates Page.last_changed_at for stale-content review.
    await _finalize_ttu_compliance_checks(scan_uuid, page_contexts)


async def _finalize_ttu_compliance_checks(scan_uuid: uuid.UUID, page_contexts: list[PageContext]) -> None:
    """Persist cross-page SB17 and post-history stale-content findings."""
    sb17_records: list[tuple[uuid.UUID, dict]] = []
    for ctx in page_contexts:
        for record in run_ttu_sb17_checks(ctx.main_text):
            sb17_records.append((ctx.page_id, record))

    async with async_session() as session:
        pages = list((await session.execute(
            select(Page).where(Page.scan_id == scan_uuid, Page.is_document.is_(False), Page.render_status == "ok")
        )).scalars().all())
        page_by_id = {page.id: page for page in pages}
        records: list[tuple[uuid.UUID, dict]] = list(sb17_records)
        for page in pages:
            record = stale_content_record(page.last_changed_at, page.url)
            if record is not None:
                records.append((page.id, record))
        for page_id, record in records:
            page = page_by_id.get(page_id)
            if page is None:
                continue
            session.add(_issue_from_record(scan_uuid, page_id, record))
            page.issue_count += 1
            page.manual_review_count += 1
        await session.commit()


async def _finalize_sitemap_checks(scan_uuid: uuid.UUID, page_contexts: list[PageContext], cfg) -> None:
    """Run sitemap checks once after the crawl and persist their findings."""
    async with async_session() as session:
        scan = await session.get(Scan, scan_uuid)
        if scan is None:
            return
        if scan.site_id is None:
            return
        site_root = scan.root_url
        pages = list((await session.execute(
            select(Page).where(Page.scan_id == scan_uuid, Page.is_document.is_(False))
        )).scalars().all())

    inspection, missing_findings = await asyncio.to_thread(
        run_sitemap_checks, site_root, [page.url for page in pages]
    )

    by_page_id = {ctx.page_id: ctx for ctx in page_contexts}
    homepage = next(
        (page for page in pages if page.url.rstrip("/") == site_root.rstrip("/")),
        pages[0] if pages else None,
    )
    if homepage is not None and inspection.findings:
        records = [finding_to_record(f) for f in inspection.findings]
        ctx = by_page_id.get(homepage.id)
        if ctx is None:
            ctx = PageContext(
                page_id=homepage.id, url=homepage.url, is_error_page=homepage.is_error_page,
                title=homepage.title or "", meta_description=homepage.meta_description,
                outbound_links=[],
            )
        ctx.scored.extend(_scored_from_record(r) for r in records if _is_site_scored_record(r))
        await _append_issues_and_rescore(scan_uuid, ctx, records, cfg)

    if not missing_findings:
        return

    # E3 is assisted and must not affect page scores. Persist all rows in one
    # transaction, while keeping manual counts separate from scored issues.
    missing_records = [finding_to_record(f) for f in missing_findings]
    records_by_url = {
        json.loads(record["html_snippet"])["page_url"]: record
        for record in missing_records
    }
    async with async_session() as session:
        page_by_url = {page.url: page for page in pages}
        for page_url, record in records_by_url.items():
            page = page_by_url.get(page_url)
            if page is None:
                continue
            session.add(_issue_from_record(scan_uuid, page.id, record))
            page.manual_review_count += 1
        await session.commit()


async def _run_page_rows(scan_uuid: uuid.UUID) -> list[Page]:
    async with async_session() as session:
        return list((await session.execute(
            select(Page).where(Page.scan_id == scan_uuid, Page.render_status == "ok")
        )).scalars().all())


async def _run_fingerprints(scan_uuid: uuid.UUID) -> set[str]:
    """Fingerprints of every issue in a run, for cross-run diffing.

    Assisted/manual-review findings are still real findings for history and
    comparison purposes; their manual-review status only controls scoring.
    """
    from app.diffing import issue_fingerprint

    async with async_session() as session:
        rows = (await session.execute(
            select(Issue, Page.url).join(Page, Issue.page_id == Page.id)
            .where(Issue.scan_id == scan_uuid)
        )).all()
    return {issue_fingerprint(i.rule_id, url, i.selector, i.html_snippet) for i, url in rows}


async def _finalize_site_history(scan_uuid: uuid.UUID, site_id: uuid.UUID) -> None:
    from app.diffing import diff_fingerprint_sets, score_deltas
    from app.models import RunDiff, Site

    now = datetime.now(timezone.utc)
    async with async_session() as session:
        scan = await session.get(Scan, scan_uuid)
        prev = (await session.execute(
            select(Scan).where(
                Scan.site_id == site_id, Scan.status == "done", Scan.id != scan_uuid,
                Scan.created_at < scan.created_at,
            ).order_by(Scan.created_at.desc()).limit(1)
        )).scalars().first()
        site = await session.get(Site, site_id)
        if site:
            site.last_scanned_at = now
        await session.commit()

    # --- content-change detection: compare each page hash to the prior run's ---
    this_pages = await _run_page_rows(scan_uuid)
    prev_by_url: dict[str, Page] = {}
    if prev is not None:
        for p in await _run_page_rows(prev.id):
            prev_by_url[p.normalized_url] = p

    async with async_session() as session:
        for p in this_pages:
            prior = prev_by_url.get(p.normalized_url)
            row = await session.get(Page, p.id)
            if prior is None or prior.content_hash != p.content_hash:
                row.last_changed_at = now  # new page or content changed this run
            else:
                row.last_changed_at = prior.last_changed_at  # carry forward
        await session.commit()

    # --- run diff vs previous run ---
    new_fps = await _run_fingerprints(scan_uuid)
    prev_fps = await _run_fingerprints(prev.id) if prev is not None else set()
    counts = diff_fingerprint_sets(new_fps, prev_fps)

    async with async_session() as session:
        scan = await session.get(Scan, scan_uuid)
        deltas = {"overall": None}
        if prev is not None:
            new_scores = {**(scan.category_scores or {}), "overall": scan.overall_score}
            prev_scores = {**(prev.category_scores or {}), "overall": prev.overall_score}
            deltas = score_deltas(new_scores, prev_scores)

        # per-page score + content-change deltas
        prev_scores_by_url = {p.normalized_url: p for p in prev_by_url.values()}
        per_page = []
        for p in this_pages:
            prior = prev_scores_by_url.get(p.normalized_url)
            per_page.append({
                "url": p.url,
                "score_b": p.score,
                "score_a": prior.score if prior else None,
                "delta": (p.score - prior.score) if (prior and p.score is not None and prior.score is not None) else None,
                "content_changed": bool(prior and prior.content_hash != p.content_hash),
            })

        session.add(RunDiff(
            site_id=site_id, scan_id=scan_uuid, prev_scan_id=(prev.id if prev else None),
            issues_new=counts.new, issues_resolved=counts.resolved, issues_unchanged=counts.unchanged,
            score_deltas=deltas, per_page=per_page,
        ))
        await session.commit()


def _scored_from_issue(iss: Issue) -> ScoredIssue:
    return ScoredIssue(
        rule_id=iss.rule_id, impact=iss.impact, category=iss.category, subcategory=iss.subcategory,
        weight=1.0, wcag_level=iss.wcag_level, wcag_version=iss.wcag_version,
        is_best_practice=iss.is_best_practice, criterion_id=iss.criterion_id, criterion_name=iss.criterion_name,
    )


async def _load_page_audits(scan_uuid: uuid.UUID) -> tuple[list[Page], list[PageAudit]]:
    """Build the scoring input from the persisted rows for this scan.

    Scoring from the in-memory crawl contexts silently under-counts: those only
    cover pages the current process rendered, so a resumed scan (or a worker that
    restarted mid-crawl) finalizes against a near-empty set and scores the site
    100 while its pages carry thousands of issues. The database is the only
    complete record, so read scores back from it.

    Documents are excluded — their checks are all assisted, so they carry no score.
    """
    from collections import defaultdict

    async with async_session() as session:
        pages = (await session.execute(
            select(Page).where(
                Page.scan_id == scan_uuid,
                Page.render_status == "ok",
                Page.is_document.is_not(True),
            )
        )).scalars().all()
        issues = (await session.execute(
            select(Issue).where(Issue.scan_id == scan_uuid, Issue.manual_review.is_(False))
        )).scalars().all()

    by_page: dict[uuid.UUID, list[ScoredIssue]] = defaultdict(list)
    for iss in issues:
        # Inspector-only aliases duplicate evidence already counted under its own
        # rule; scoring them again would double-penalise the site.
        if iss.rule_id in _INSPECTOR_ONLY_ACCESSIBILITY_RULES:
            continue
        by_page[iss.page_id].append(_scored_from_issue(iss))

    audits = [
        PageAudit(key=p.url, issues=by_page.get(p.id, []), is_error_page=p.is_error_page)
        for p in pages
    ]
    return list(pages), audits


async def rescore_scan(scan_uuid: uuid.UUID):
    """Recompute all scores from the issues currently in the DB, and persist page
    scores, check-score rows, and site scores. Used after a single-URL retest
    mutates one page's findings. Returns the SiteScore."""
    from collections import defaultdict

    cfg = load_scoring_config()
    pages, page_audits = await _load_page_audits(scan_uuid)
    by_page: dict[uuid.UUID, list[ScoredIssue]] = {
        p.id: audit.issues for p, audit in zip(pages, page_audits)
    }
    site = compute_site_scores(page_audits, cfg)

    async with async_session() as session:
        # per-page scores
        for p in pages:
            ps = compute_page_score(
                PageAudit(key=p.url, issues=by_page.get(p.id, []), is_error_page=p.is_error_page), cfg
            )
            row = await session.get(Page, p.id)
            if row:
                row.score = ps["score"]
                row.score_a, row.score_aa, row.score_aaa = ps["score_a"], ps["score_aa"], ps["score_aaa"]

        # replace check-score rows
        await session.execute(delete(CheckScoreRow).where(CheckScoreRow.scan_id == scan_uuid))
        for c in site.checks:
            session.add(CheckScoreRow(
                scan_id=scan_uuid, rule_id=c.rule_id, category=c.category, subcategory=c.subcategory,
                criterion_id=c.criterion_id, criterion_name=c.criterion_name,
                wcag_version=c.wcag_version, wcag_level=c.wcag_level, is_best_practice=c.is_best_practice,
                pages_affected=c.pages_affected, avg_issues=c.avg_issues, pct_affected=c.pct_affected,
                check_score=c.check_score, penalty=c.penalty,
            ))

        scan = await session.get(Scan, scan_uuid)
        scan.overall_score = site.overall
        scan.overall_band = site.band
        scan.accessibility_score = site.accessibility
        scan.wcag_scores = site.wcag
        scan.category_scores = site.category_scores
        scan.score_a = site.wcag.get("wcag-22-a")
        scan.score_aa = site.wcag.get("wcag-22-aa")
        scan.score_aaa = site.wcag.get("wcag-22-aaa")
        await session.commit()

    return site
