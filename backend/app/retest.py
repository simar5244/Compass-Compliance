"""Instant single-URL retest.

Renders and audits ONE url through the exact same `audit_page` path a crawl
uses (all checks, all three viewports), then:
  * upserts that page — replacing its previous findings,
  * re-runs the cross-page checks scoped to what this page participates in
    (its own outbound broken links; the duplicate title/meta groups it left or
    joined),
  * re-scores the whole scan from the DB and returns the updated page + category
    + overall scores so the UI can refresh in place.

Runs as an arq job that executes concurrently with any in-flight crawl (see
worker `max_jobs`), so a retest returns quickly instead of queuing behind a crawl.
"""

from __future__ import annotations

import logging
import uuid
from collections import Counter
from datetime import datetime, timezone

from playwright.async_api import async_playwright
from sqlalchemy import delete, select

from app.audit.content_checks import finding_to_record
from app.config import settings
from app.db import async_session
from app.models import Issue, Page, RetestJob, Scan
from app.page_pipeline import audit_page
from app.render.capture import DESKTOP_VIEWPORT
from app.render.worker import DESKTOP_USER_AGENT, RenderConfig
from app.scan_engine import (
    _attach_refs,
    _dup_title_finding,
    _issue_from_record,
    rescore_scan,
)
from app.scoring.config import load_scoring_config
from app.scoring.engine import PageAudit, ScoredIssue, compute_page_score
from app.crawl.normalize import normalize_url
from app.storage.artifacts import save_page_artifacts

logger = logging.getLogger("wcag_scanner.retest")


def _render_config() -> RenderConfig:
    return RenderConfig(
        goto_timeout_ms=settings.goto_timeout_ms,
        quiet_ms=settings.stability_quiet_ms,
        stability_ceiling_ms=settings.stability_ceiling_ms,
    )


async def _set_state(job_id: uuid.UUID, state: str, **fields) -> None:
    async with async_session() as session:
        job = await session.get(RetestJob, job_id)
        if job:
            job.state = state
            for k, v in fields.items():
                setattr(job, k, v)
            await session.commit()


async def run_retest(job_id: str) -> None:
    job_uuid = uuid.UUID(job_id)
    try:
        await _run(job_uuid)
    except Exception as exc:  # noqa: BLE001 - job guard
        logger.exception("Retest %s failed", job_id)
        await _set_state(job_uuid, "failed", error=str(exc)[:1000], done_at=datetime.now(timezone.utc))


async def _run(job_uuid: uuid.UUID) -> None:
    now = datetime.now(timezone.utc)
    async with async_session() as session:
        job = await session.get(RetestJob, job_uuid)
        if job is None:
            return
        scan = await session.get(Scan, job.scan_id)
        if scan is None:
            job.state = "failed"; job.error = "scan not found"; job.done_at = now
            await session.commit()
            return
        scan_uuid = scan.id
        root_url = scan.root_url
        url = job.url
        custom_dict = {w for w in (scan.custom_dictionary or []) if isinstance(w, str)}

    # --- rendering + auditing (same path as a crawl page) ---
    await _set_state(job_uuid, "rendering", rendering_at=now)
    render_cfg = _render_config()
    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        context = await browser.new_context(viewport=DESKTOP_VIEWPORT, user_agent=DESKTOP_USER_AGENT)
        try:
            await _set_state(job_uuid, "auditing", auditing_at=datetime.now(timezone.utc))
            audited = await audit_page(context, url, render_cfg, custom_dict, root_url)
        finally:
            await context.close()
            await browser.close()

    if not audited.ok:
        await _set_state(job_uuid, "failed", error=audited.error or "render failed",
                         done_at=datetime.now(timezone.utc))
        return

    # --- upsert the page + replace its issues ---
    page_id = await _upsert_page(scan_uuid, url, audited)

    # --- finalizing: scoped cross-page checks ---
    await _set_state(job_uuid, "finalizing", finalizing_at=datetime.now(timezone.utc))
    await _recompute_duplicates(scan_uuid)
    site = await rescore_scan(scan_uuid)

    # --- assemble result payload for the UI ---
    result = await _build_result(scan_uuid, page_id, site)
    await _set_state(job_uuid, "done", done_at=datetime.now(timezone.utc), result=result)


async def _upsert_page(scan_uuid: uuid.UUID, url: str, audited) -> uuid.UUID:
    cfg = load_scoring_config()
    norm = normalize_url(url)
    manual = sum(1 for r in audited.records if r["manual_review"])
    scored = [
        ScoredIssue(
            rule_id=r["rule_id"], impact=r["impact"], category=r.get("category", "accessibility"),
            subcategory=r.get("subcategory"), weight=r.get("weight", 1.0),
            wcag_level=r["wcag_level"], wcag_version=r["wcag_version"],
            is_best_practice=r["is_best_practice"], criterion_id=r["criterion_id"],
            criterion_name=r["criterion_name"],
        )
        for r in audited.records if not r["manual_review"]
    ]
    page_scores = compute_page_score(
        PageAudit(key=url, issues=scored, is_error_page=audited.is_error_page), cfg
    )

    async with async_session() as session:
        existing = (await session.execute(
            select(Page).where(Page.scan_id == scan_uuid, Page.normalized_url == norm)
        )).scalars().first()

        if existing:
            page = existing
            await session.execute(delete(Issue).where(Issue.page_id == page.id))
        else:
            page = Page(scan_id=scan_uuid, url=url, normalized_url=norm, depth=0)
            session.add(page)
            await session.flush()

        page.render_status = "ok"
        page.status_code = audited.status_code
        page.final_url = audited.final_url
        page.title = audited.title
        page.meta_description = audited.meta_description
        page.stability_reason = audited.stability_reason
        page.cookie_rule = audited.cookie_rule
        page.render_ms = audited.render_ms
        page.attempts = audited.attempts
        page.is_error_page = audited.is_error_page
        page.score = page_scores["score"]
        page.score_a, page.score_aa, page.score_aaa = (
            page_scores["score_a"], page_scores["score_aa"], page_scores["score_aaa"])
        page.issue_count = len(audited.records) - manual
        page.manual_review_count = manual
        page.scanned_at = datetime.now(timezone.utc)
        await session.flush()

        refs = await save_page_artifacts(
            str(scan_uuid), str(page.id),
            desktop_png=audited.desktop_png, mobile_png=audited.mobile_png,
            narrow_png=audited.narrow_png, serialized_dom=audited.serialized_dom,
        )
        page.desktop_screenshot_ref = refs["desktop_screenshot"]
        page.mobile_screenshot_ref = refs["mobile_screenshot"]
        page.narrow_screenshot_ref = refs["narrow_screenshot"]
        page.dom_ref = refs["dom"]
        page.screenshots = _attach_refs(audited.screenshots_meta, refs)

        for r in audited.records:
            session.add(_issue_from_record(scan_uuid, page.id, r))
        await session.commit()
        return page.id


async def _recompute_duplicates(scan_uuid: uuid.UUID) -> None:
    """Recompute duplicate title / meta-description issues across the whole scan.

    Full recompute (not incremental) so a page that just left or joined a
    duplicate group is reconciled correctly. Only the 'Duplicate ...' issues are
    touched; per-page 'missing' issues come from the content checks and are left
    alone."""
    async with async_session() as session:
        pages = (await session.execute(
            select(Page).where(Page.scan_id == scan_uuid, Page.render_status == "ok")
        )).scalars().all()

        # Remove existing duplicate issues; we'll rebuild them.
        await session.execute(delete(Issue).where(
            Issue.scan_id == scan_uuid,
            Issue.rule_id.in_(["page-title", "meta-description"]),
            Issue.description.like("Duplicate%"),
        ))

        titles = Counter(p.title for p in pages if p.title)
        for p in pages:
            if p.title and titles[p.title] > 1:
                session.add(_issue_from_record(scan_uuid, p.id, finding_to_record(_dup_title_finding(p.title))))
        await session.commit()


async def _build_result(scan_uuid: uuid.UUID, page_id: uuid.UUID, site) -> dict:
    async with async_session() as session:
        page = await session.get(Page, page_id)
        issues = (await session.execute(
            select(Issue).where(Issue.page_id == page_id).order_by(Issue.category, Issue.rule_id)
        )).scalars().all()
    return {
        "page_id": str(page_id),
        "page_score": page.score if page else None,
        "issue_count": page.issue_count if page else 0,
        "manual_review_count": page.manual_review_count if page else 0,
        "issues": [
            {
                "rule_id": i.rule_id, "category": i.category, "subcategory": i.subcategory,
                "impact": i.impact, "description": i.description, "manual_review": i.manual_review,
                "wcag_level": i.wcag_level, "criterion_id": i.criterion_id, "viewport": i.viewport,
            }
            for i in issues
        ],
        "overall_score": site.overall,
        "overall_band": site.band,
        "category_scores": site.category_scores,
        "wcag_scores": site.wcag,
    }
