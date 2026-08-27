"""Platform site endpoints: dashboard aggregates, site detail, run history, run
report, and run comparison. Every query is scoped to the caller's assigned sites
(admins see all); users can never reach an unassigned site (404, no leak).
"""

from __future__ import annotations

import json
import uuid
from collections import defaultdict
from typing import Callable
from urllib.parse import urlparse

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from sqlalchemy import func, select

from spellchecker import SpellChecker

from app.auth.deps import assigned_site_ids, authorize_site, get_current_user, require_admin
from app.audit.accessibility_scope import INSPECTOR_ONLY_ALIAS_RULES
from collections import defaultdict

from app.api.page_detail import _scored_issue
from app.audit.check_catalog import CHECK_CATALOG, LIGHTHOUSE_RULE_IDS
from app.audit.disability_groups import DISABILITY_GROUPS, groups_for
from app.audit.pdf_checks import PDF_CHECK_RULE_IDS
from app.scoring.config import load_scoring_config
from app.scoring.engine import PageAudit, compute_page_score
from app.audit.module_check_sets import (
    ALL_LISTED_RULE_IDS,
    MODULE_CHECK_ORDER,
    listed_display_name,
)
from app.config import settings
from app.crawl.normalize import normalize_url
from app.db import async_session
from app.diffing import diff_fingerprint_sets, issue_fingerprint, score_deltas
from app.models import (
    ApprovedGrammar,
    CheckScoreRow,
    IgnoredGrammarRule,
    Issue,
    Page,
    RunDiff,
    Scan,
    Site,
    SiteAssignment,
    User,
)
from app.schemas import IssueOut

router = APIRouter(prefix="/sites", tags=["sites"])
_CHECK_BY_ID = {entry.rule_id: entry for entry in CHECK_CATALOG}
_INSPECTOR_ONLY_ACCESSIBILITY_RULES = INSPECTOR_ONLY_ALIAS_RULES

# error = critical|serious, warning = moderate, info = minor/other
_SEV = {"critical": "error", "serious": "error", "moderate": "warning"}


def _sev_bucket(impact: str | None) -> str:
    return _SEV.get(impact or "", "info")


def _sev_sort_key(impact: str | None) -> int:
    return {"critical": 0, "serious": 1, "moderate": 2, "minor": 3, "info": 4, None: 5}.get(impact, 5)


def _worst_impact(impacts: list[str | None]) -> str | None:
    if not impacts:
        return None
    # Lower key == worse
    return sorted(impacts, key=_sev_sort_key)[0]


async def _latest_done_scan(session, site_id: uuid.UUID) -> Scan | None:
    return (await session.execute(
        select(Scan).where(Scan.site_id == site_id, Scan.status == "done")
        .order_by(Scan.created_at.desc()).limit(1)
    )).scalars().first()


async def _severity_counts(session, scan_id: uuid.UUID) -> dict[str, int]:
    rows = (await session.execute(
        select(Issue.impact, func.count(Issue.id))
        .where(Issue.scan_id == scan_id, Issue.manual_review.is_(False), Issue.reviewed.is_(False))
        .group_by(Issue.impact)
    )).all()
    out = {"error": 0, "warning": 0, "info": 0}
    for impact, n in rows:
        out[_sev_bucket(impact)] += n
    return out


async def _score_history(session, site_id: uuid.UUID, limit: int = 12) -> list[int]:
    rows = (await session.execute(
        select(Scan.overall_score).where(Scan.site_id == site_id, Scan.status == "done")
        .order_by(Scan.created_at.desc()).limit(limit)
    )).scalars().all()
    return [s for s in reversed(rows) if s is not None]


async def _site_card(session, site: Site, is_admin: bool) -> dict:
    latest = await _latest_done_scan(session, site.id)
    card: dict = {
        "id": str(site.id), "name": site.name, "root_url": site.root_url,
        "overall_score": latest.overall_score if latest else None,
        "overall_band": latest.overall_band if latest else None,
        "pages": None, "last_scanned_at": None, "last_content_change": None,
        "concerns": {"error": 0, "warning": 0, "info": 0},
        "score_history": await _score_history(session, site.id),
        "latest_scan_id": str(latest.id) if latest else None,
        "recrawl_interval_days": site.recrawl_interval_days,
    }
    # Crawl coverage: how many pages the site allows, and whether the last scan
    # hit that cap (partial coverage) or crawled everything within depth.
    card["max_pages"] = site.max_pages
    card["max_depth"] = site.max_depth
    card["crawl_limit_reached"] = bool(latest and latest.pages_crawled >= latest.max_pages)
    if latest:
        page_count = (await session.execute(
            select(func.count(Page.id)).where(
                Page.scan_id == latest.id, Page.render_status == "ok",
                Page.is_document.is_(False),
            )
        )).scalar()
        card["documents"] = (await session.execute(
            select(func.count(Page.id)).where(Page.scan_id == latest.id, Page.is_document.is_(True))
        )).scalar()
        last_change = (await session.execute(
            select(func.max(Page.last_changed_at)).where(Page.scan_id == latest.id)
        )).scalar()
        card["pages"] = page_count
        card["last_scanned_at"] = (latest.finished_at or latest.created_at).isoformat()
        card["last_content_change"] = last_change.isoformat() if last_change else None
        card["concerns"] = await _severity_counts(session, latest.id)
    # In-progress scan (if any) so the dashboard can show live progress and
    # resume it across reloads.
    active = (await session.execute(
        select(Scan).where(
            Scan.site_id == site.id, Scan.status.in_(["pending", "crawling", "scoring"])
        ).order_by(Scan.created_at.desc()).limit(1)
    )).scalars().first()
    card["active_scan"] = {
        "id": str(active.id), "status": active.status,
        "pages_crawled": active.pages_crawled, "pages_queued": active.pages_queued,
        "started_at": (active.started_at or active.created_at).isoformat(),
    } if active is not None else None
    if is_admin:
        card["assigned_user_count"] = (await session.execute(
            select(func.count(SiteAssignment.id)).where(SiteAssignment.site_id == site.id)
        )).scalar()
    return card


@router.get("")
async def list_sites(user: User = Depends(get_current_user)) -> dict:
    allowed = await assigned_site_ids(user)
    async with async_session() as session:
        q = select(Site).order_by(Site.name)
        if allowed is not None:
            if not allowed:
                return {"sites": [], "totals": {"sites": 0, "errors": 0, "warnings": 0}}
            q = q.where(Site.id.in_(allowed))
        sites = (await session.execute(q)).scalars().all()
        cards = [await _site_card(session, s, user.role == "admin") for s in sites]
    totals = {
        "sites": len(cards),
        "errors": sum(c["concerns"]["error"] for c in cards),
        "warnings": sum(c["concerns"]["warning"] for c in cards),
    }
    return {"sites": cards, "totals": totals}


@router.get("/{site_id}")
async def get_site(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    site = await authorize_site(site_id, user)
    async with async_session() as session:
        card = await _site_card(session, site, user.role == "admin")
        latest = await _latest_done_scan(session, site.id)
        card["settings"] = {
            "recrawl_interval_days": site.recrawl_interval_days,
            "force_rescan": site.force_rescan,
            "max_pages": site.max_pages, "max_depth": site.max_depth,
            "ignore_patterns": site.ignore_patterns or [],
        }
        card["category_scores"] = latest.category_scores if latest else {}
        card["wcag_scores"] = latest.wcag_scores if latest else {}

        # Representative screenshots for the site overview (device mockups).
        card["latest_desktop_screenshot_ref"] = None
        card["latest_mobile_screenshot_ref"] = None
        card.setdefault("documents", 0)  # real count comes from _site_card (PDF documents)

        if latest is not None:
            # Prefer the root URL page's captures; else fall back to the first ok page.
            root = (await session.execute(
                select(Page).where(
                    Page.scan_id == latest.id,
                    Page.render_status == "ok",
                    Page.url == latest.root_url,
                ).limit(1)
            )).scalars().first()
            if root is None:
                root = (await session.execute(
                    select(Page).where(
                        Page.scan_id == latest.id,
                        Page.render_status == "ok",
                    ).order_by(Page.depth.asc(), Page.scanned_at.asc()).limit(1)
                )).scalars().first()
            if root is not None:
                card["latest_desktop_screenshot_ref"] = root.desktop_screenshot_ref
                card["latest_mobile_screenshot_ref"] = root.mobile_screenshot_ref

    return card


@router.get("/{site_id}/runs")
async def list_runs(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    await authorize_site(site_id, user)
    async with async_session() as session:
        scans = (await session.execute(
            select(Scan).where(Scan.site_id == site_id).order_by(Scan.created_at.desc())
        )).scalars().all()
        diffs = {
            d.scan_id: d for d in (await session.execute(
                select(RunDiff).where(RunDiff.site_id == site_id)
            )).scalars().all()
        }
        runs = []
        for s in scans:
            pages = (await session.execute(
                select(func.count(Page.id)).where(Page.scan_id == s.id, Page.render_status == "ok")
            )).scalar()
            d = diffs.get(s.id)
            runs.append({
                "scan_id": str(s.id), "status": s.status, "trigger": s.trigger,
                "created_at": s.created_at.isoformat(),
                "finished_at": s.finished_at.isoformat() if s.finished_at else None,
                "pages": pages, "overall_score": s.overall_score,
                "category_scores": s.category_scores or {},
                "issues_new": d.issues_new if d else None,
                "issues_resolved": d.issues_resolved if d else None,
                "score_deltas": d.score_deltas if d else {},
            })
    return {"runs": runs}


@router.get("/{site_id}/checks")
async def list_checks(
    site_id: uuid.UUID,
    category: str | None = None,
    user: User = Depends(get_current_user),
) -> dict:
    """Latest-run checks list for the Site Overview and category check lists.

    This is intentionally minimal for now (issue counts + score + severity). We'll
    expand it later for assisted/policy buckets, status, assignees, etc.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"scan_id": None, "checks": []}

        q = select(CheckScoreRow).where(CheckScoreRow.scan_id == latest.id)
        if category:
            q = q.where(CheckScoreRow.category == category)
        rows = (await session.execute(q)).scalars().all()

        # Issue counts per check in the latest run.
        counts = {
            rid: n
            for rid, n in (await session.execute(
                select(Issue.rule_id, func.count(Issue.id))
                .where(Issue.scan_id == latest.id, Issue.manual_review.is_(False), Issue.reviewed.is_(False))
                .group_by(Issue.rule_id)
            )).all()
        }

        # Severity per check: worst impact observed for that rule_id.
        sev_rank = {"critical": 0, "serious": 1, "moderate": 2, "minor": 3, "info": 4}
        severity: dict[str, str | None] = {}
        for rid, impact in (await session.execute(
            select(Issue.rule_id, Issue.impact)
            .where(Issue.scan_id == latest.id, Issue.manual_review.is_(False), Issue.reviewed.is_(False))
        )).all():
            cur = severity.get(rid)
            if cur is None:
                severity[rid] = impact
            else:
                if sev_rank.get(impact or "info", 4) < sev_rank.get(cur or "info", 4):
                    severity[rid] = impact

    out = []
    for r in rows:
        rid = r.rule_id
        if rid in _INSPECTOR_ONLY_ACCESSIBILITY_RULES:
            continue
        out.append({
            "check_id": rid,
            "category": r.category,
            "subcategory": r.subcategory,
            "criterion_id": r.criterion_id,
            "criterion_name": r.criterion_name,
            "wcag_version": r.wcag_version,
            "wcag_level": r.wcag_level,
            "is_best_practice": r.is_best_practice,
            "check_score": r.check_score,
            "issues": int(counts.get(rid, 0)),
            "severity": severity.get(rid),
            # Placeholder until assignments/progress are implemented.
            "progress": None,
        })

    out.sort(key=lambda x: (_sev_sort_key(x.get("severity")), -(x.get("issues") or 0)))
    return {"scan_id": str(latest.id), "checks": out}


def _reported_score(row, issue_count: int) -> int | None:
    """The score to report for a check, or None when it is not scored.

    ``row`` is the persisted per-check score for the latest scan, absent when
    the check contributed nothing the scoring pass could weigh: its findings
    were review items, or they sat on documents, which are not scored.
    """
    if row is not None:
        return row.check_score
    return 100 if issue_count == 0 else None


@router.get("/{site_id}/checks-full")
async def list_checks_full(
    site_id: uuid.UUID,
    category: str | None = None,
    user: User = Depends(get_current_user),
) -> dict:
    """Return the complete applicable check catalogue merged with latest data."""
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        rows = []
        counts: dict[str, int] = {}
        severities: dict[str, str | None] = {}
        if latest is not None:
            rows = list((await session.execute(
                select(CheckScoreRow).where(CheckScoreRow.scan_id == latest.id)
            )).scalars().all())
            counts = {
                rid: int(n)
                for rid, n in (await session.execute(
                    select(Issue.rule_id, func.count(Issue.id))
                    .where(Issue.scan_id == latest.id, Issue.reviewed.is_(False))
                    .group_by(Issue.rule_id)
                )).all()
            }
            for rid, impact in (await session.execute(
                select(Issue.rule_id, Issue.impact)
                .where(Issue.scan_id == latest.id, Issue.reviewed.is_(False))
            )).all():
                current = severities.get(rid)
                if current is None or _sev_sort_key(impact) < _sev_sort_key(current):
                    severities[rid] = impact

    score_by_id = {row.rule_id: row for row in rows}
    # Content and Accessibility are explicit, ordered lists rather than "whatever
    # carries this category", because several of their checks are owned elsewhere.
    module_order = MODULE_CHECK_ORDER.get(category or "")
    retired = ALL_LISTED_RULE_IDS

    catalog = list(CHECK_CATALOG)
    if module_order is not None:
        by_id = {entry.rule_id: entry for entry in catalog}
        catalog = [by_id[rid] for rid in module_order if rid in by_id]

    listed_here = set(module_order or ())
    checks = []
    for entry in catalog:
        # Alias rules are hidden by default, but a module that names one explicitly
        # means it, so listing wins over the alias suppression.
        if entry.rule_id in _INSPECTOR_ONLY_ACCESSIBILITY_RULES and entry.rule_id not in listed_here:
            continue
        if module_order is not None:
            pass  # already narrowed and ordered above
        elif category and entry.category != category:
            continue
        elif not category and entry.category in MODULE_CHECK_ORDER and entry.rule_id not in retired:
            # Checks retired from a module should not resurface in the unfiltered listing.
            continue
        blocked = entry.rule_id in {
            "render_blocking_resources", "unused_javascript", "unused_css", "excessive_dom_size",
            "legacy_javascript", "third_party_impact", "total_page_weight", "long_main_thread_tasks",
            "cache_ttl", "font_display", "unminified_css", "unminified_javascript", "preconnect_missing",
            "high_rtt", "js_execution_time", "defer_offscreen_images", "image_modern_format",
            "image_resolution", "image_optimization", "passive_event_listeners", "time_to_interactive",
            "missing_js_files", "missing_css_files",
        } and not settings.enable_lighthouse
        row = score_by_id.get(entry.rule_id)
        issue_count = counts.get(entry.rule_id, 0)
        checks.append({
            "check_id": entry.rule_id,
            "display_name": entry.display_name,
            "category": entry.category,
            "subcategory": entry.subcategory,
            "criterion_id": entry.wcag_criterion.split()[-1] if entry.wcag_criterion else None,
            "criterion_name": entry.display_name,
            "wcag_criterion": entry.wcag_criterion,
            "wcag_version": entry.wcag_criterion.split()[1] if entry.wcag_criterion else None,
            "wcag_level": entry.wcag_criterion.split()[2] if entry.wcag_criterion else None,
            "is_best_practice": entry.wcag_criterion is None,
            "severity": severities.get(entry.rule_id) if issue_count else None,
            "catalog_severity": entry.severity,
            "assisted": entry.assisted,
            "description": entry.description,
            # Scoring covers pages only, and only findings the engine can decide
            # for itself. A check with no score row therefore has nothing to
            # score against — either it found nothing (nothing to fix, so 100),
            # or its findings are review items that carry no score. Reporting 0
            # in that second case would read as total failure, and progress must
            # agree with the score rather than contradict it.
            "check_score": None if blocked else _reported_score(row, issue_count),
            "issues": None if blocked else issue_count,
            "progress": None if blocked else _reported_score(row, issue_count),
            "blocked_by": "lighthouse_disabled" if blocked else None,
        })
    return {"scan_id": str(latest.id) if latest else None, "checks": checks}


@router.get("/{site_id}/checks/{check_id}")
async def get_check_detail(
    site_id: uuid.UUID,
    check_id: str,
    limit: int = 12,
    user: User = Depends(get_current_user),
) -> dict:
    """Check detail for a site in the context of its latest run.

    Returns a score/issue trend over recent runs plus the pages affected in the
    latest run.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            raise HTTPException(404, "No completed scan yet")

        row = (await session.execute(
            select(CheckScoreRow).where(CheckScoreRow.scan_id == latest.id, CheckScoreRow.rule_id == check_id)
        )).scalars().first()
        catalog_entry = next((entry for entry in CHECK_CATALOG if entry.rule_id == check_id), None)
        if row is None and catalog_entry is None:
            raise HTTPException(404, "Check not found")

        issue_rows = (await session.execute(
            select(Issue, Page.url, Page.score)
            .join(Page, Issue.page_id == Page.id)
            .where(Issue.scan_id == latest.id, Issue.rule_id == check_id)
            .order_by(Issue.category, Issue.id).limit(100)
        )).all()

        # Pages affected in the latest run, ordered by number of instances.
        # Review items count too: an assisted check's findings are all
        # manual_review, so excluding them reported zero next to a full list.
        affected_filter = (
            Issue.scan_id == latest.id,
            Issue.rule_id == check_id,
            Issue.reviewed.is_(False),
        )
        page_rows = (await session.execute(
            select(
                Page.id,
                Page.url,
                Page.score,
                Page.desktop_screenshot_ref,
                func.count(Issue.id).label("instances"),
            )
            .join(Issue, Issue.page_id == Page.id)
            .where(*affected_filter)
            .group_by(Page.id)
            .order_by(func.count(Issue.id).desc())
            .limit(50)
        )).all()

        # The list above is capped for display; the headline totals must still
        # describe the whole run, or a check on 200 pages reports exactly 50.
        totals_row = (await session.execute(
            select(
                func.count(func.distinct(Issue.page_id)),
                func.count(Issue.id),
            )
            .select_from(Issue)
            .where(*affected_filter)
        )).one()

        impacts = [i for (i,) in (await session.execute(
            select(Issue.impact)
            .where(Issue.scan_id == latest.id, Issue.rule_id == check_id, Issue.manual_review.is_(False), Issue.reviewed.is_(False))
        )).all()]
        severity = _worst_impact(impacts)

        pages = [
            {
                "page_id": str(pid),
                "url": url,
                "page_score": pscore,
                "desktop_screenshot_ref": shot,
                "instances": int(instances or 0),
            }
            for pid, url, pscore, shot, instances in page_rows
        ]
        totals = {
            "pages_affected": int(totals_row[0] or 0),
            "instances": int(totals_row[1] or 0),
        }

        # Trend over recent runs.
        scans = (await session.execute(
            select(Scan)
            .where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.desc())
            .limit(max(1, min(limit, 24)))
        )).scalars().all()
        scan_ids = [s.id for s in scans]

        check_by_scan = {
            sid: (score, pages_affected)
            for sid, score, pages_affected in (await session.execute(
                select(CheckScoreRow.scan_id, CheckScoreRow.check_score, CheckScoreRow.pages_affected)
                .where(CheckScoreRow.scan_id.in_(scan_ids), CheckScoreRow.rule_id == check_id)
            )).all()
        }
        issue_counts = {
            sid: int(n)
            for sid, n in (await session.execute(
                select(Issue.scan_id, func.count(Issue.id))
                .where(Issue.scan_id.in_(scan_ids), Issue.rule_id == check_id, Issue.manual_review.is_(False), Issue.reviewed.is_(False))
                .group_by(Issue.scan_id)
            )).all()
        }

        series = []
        for s in reversed(scans):
            cs = check_by_scan.get(s.id)
            series.append({
                "scan_id": str(s.id),
                "created_at": s.created_at.isoformat(),
                "check_score": (cs[0] if cs else None),
                "pages_affected": (cs[1] if cs else None),
                "issues": issue_counts.get(s.id, 0),
            })

    return {
        "site_id": str(site_id),
        "check_id": check_id,
        "latest_scan_id": str(latest.id),
        "check": {
            "category": row.category if row else catalog_entry.category,
            "subcategory": row.subcategory if row else catalog_entry.subcategory,
            "criterion_id": row.criterion_id if row else (catalog_entry.wcag_criterion.split()[-1] if catalog_entry.wcag_criterion else None),
            "criterion_name": row.criterion_name if row else catalog_entry.display_name,
            "wcag_version": row.wcag_version if row else (catalog_entry.wcag_criterion.split()[1] if catalog_entry.wcag_criterion else None),
            "wcag_level": row.wcag_level if row else (catalog_entry.wcag_criterion.split()[2] if catalog_entry.wcag_criterion else None),
            "is_best_practice": row.is_best_practice if row else catalog_entry.wcag_criterion is None,
            "check_score": row.check_score if row else (None if check_id in LIGHTHOUSE_RULE_IDS and not settings.enable_lighthouse else 100),
            "severity": severity,
            **totals,
        },
        "series": series,
        "pages": pages,
        "issues": [
            {
                **IssueOut.model_validate(issue).model_dump(),
                "page_id": str(issue.page_id),
                "page_url": page_url,
                "page_score": page_score,
            }
            for issue, page_url, page_score in issue_rows
        ],
    }


@router.get("/{site_id}/pages")
async def list_pages(
    site_id: uuid.UUID,
    category: str | None = None,
    include_documents: bool = False,
    user: User = Depends(get_current_user),
) -> dict:
    """Latest-run pages list for a site.

    If `category` is provided, also includes that category's issue counts per page
    (for category Pages screens). Documents are left out unless
    `include_documents` is set — the amount-of-content screen counts their words
    alongside pages, everywhere else they have their own screen.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"scan_id": None, "pages": []}

        # Documents have their own screen; a Pages list should only hold pages.
        pages = (await session.execute(
            select(Page)
            .where(
                Page.scan_id == latest.id,
                *([] if include_documents else [Page.is_document.is_not(True)]),
            )
            .order_by(Page.depth.asc(), Page.url.asc())
        )).scalars().all()

        # CMS badge per page from Inventory tech detection.
        cms_by_page: dict[uuid.UUID, str] = {}
        for page_id, name in (await session.execute(
            select(Issue.page_id, func.min(Issue.html_snippet))
            .where(
                Issue.scan_id == latest.id,
                Issue.category == "inventory",
                Issue.subcategory.ilike("%CMS%"),
            )
            .group_by(Issue.page_id)
        )).all():
            if name:
                cms_by_page[page_id] = str(name)

        # Per-page category issue counts (optional).
        issue_counts: dict[uuid.UUID, int] = {}
        category_scores: dict[uuid.UUID, int | None] = {}
        if category:
            for page_id, n in (await session.execute(
                select(Issue.page_id, func.count(Issue.id))
                .where(
                    Issue.scan_id == latest.id,
                    Issue.manual_review.is_(False),
                    Issue.reviewed.is_(False),
                    Issue.category == category,
                )
                .group_by(Issue.page_id)
            )).all():
                issue_counts[page_id] = int(n)

            # A category screen ranks pages by how that category scores, not by the
            # page's overall score, so score each page against this category alone.
            scored_issues = (await session.execute(
                select(Issue).where(
                    Issue.scan_id == latest.id,
                    Issue.manual_review.is_(False),
                    Issue.reviewed.is_(False),
                )
            )).scalars().all()
            by_page: dict[uuid.UUID, list] = defaultdict(list)
            for issue in scored_issues:
                by_page[issue.page_id].append(_scored_issue(issue))

            cfg = load_scoring_config()
            for page in pages:
                result = compute_page_score(
                    PageAudit(key=page.url, issues=by_page.get(page.id, []), is_error_page=page.is_error_page),
                    cfg,
                )
                category_scores[page.id] = result["category_scores"].get(category)

    out = []
    for p in pages:
        out.append({
            "page_id": str(p.id),
            "title": p.title,
            "cms": cms_by_page.get(p.id),
            "url": p.url,
            "depth": p.depth,
            "render_status": p.render_status,
            "status_code": p.status_code,
            "is_error_page": p.is_error_page,
            "score": p.score,
            "issue_count": p.issue_count,
            "manual_review_count": p.manual_review_count,
            "last_changed_at": p.last_changed_at.isoformat() if p.last_changed_at else None,
            "render_unstable": p.render_unstable,
            "desktop_screenshot_ref": p.desktop_screenshot_ref,
            "mobile_screenshot_ref": p.mobile_screenshot_ref,
            "word_count": p.word_count,
            "sentence_count": p.sentence_count,
            "reading_age": p.reading_age,
            "is_document": p.is_document,
            "category_issue_count": (int(issue_counts.get(p.id, 0)) if category else None),
            "category_score": (category_scores.get(p.id) if category else None),
        })
    return {"scan_id": str(latest.id), "pages": out}


@router.get("/{site_id}/issues")
async def list_site_issues(
    site_id: uuid.UUID,
    category: str | None = None,
    subcategory: str | None = None,
    user: User = Depends(get_current_user),
) -> dict:
    """Return issue instances from the latest completed scan for module overviews."""
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"scan_id": None, "issues": []}
        filters = [Issue.scan_id == latest.id, Issue.reviewed.is_(False)]
        if category:
            filters.append(Issue.category == category)
        if subcategory:
            filters.append(Issue.subcategory == subcategory)
        rows = (await session.execute(
            select(Issue, Page.url).join(Page, Page.id == Issue.page_id).where(*filters)
            .order_by(Issue.category, Issue.subcategory, Issue.rule_id, Page.url)
        )).all()
        issues = []
        for issue, page_url in rows:
            item = IssueOut.model_validate(issue).model_dump(mode="json")
            item["page_url"] = page_url
            item["scan_id"] = str(latest.id)
            issues.append(item)
    return {"scan_id": str(latest.id), "issues": issues}


@router.post("/{site_id}/issues/ignore")
async def ignore_issues(site_id: uuid.UUID, payload: dict, user: User = Depends(get_current_user)) -> dict:
    """Mark one or more issues as ignored (stored in Issue.reviewed).

    We reuse the existing `reviewed` flag so we don't need a new migration.
    """
    await authorize_site(site_id, user)
    raw_ids = payload.get("issue_ids") or []
    issue_ids: list[uuid.UUID] = []
    for rid in raw_ids:
        try:
            issue_ids.append(uuid.UUID(str(rid)))
        except Exception:
            continue
    if not issue_ids:
        return {"ok": True, "updated": 0}

    async with async_session() as session:
        # Ensure issues belong to this site.
        rows = (await session.execute(
            select(Issue.id)
            .join(Scan, Issue.scan_id == Scan.id)
            .where(Issue.id.in_(issue_ids), Scan.site_id == site_id)
        )).scalars().all()
        allowed = set(rows)
        if not allowed:
            return {"ok": True, "updated": 0}
        await session.execute(
            Issue.__table__.update().where(Issue.id.in_(allowed)).values(reviewed=True, is_ignored=True)
        )
        await session.commit()
    return {"ok": True, "updated": len(allowed)}


@router.post("/{site_id}/issues/lookup")
async def lookup_issues(site_id: uuid.UUID, payload: dict, user: User = Depends(get_current_user)) -> dict:
    """Resolve issue ids to their page + scan so the UI can deep-link into the inspector."""
    await authorize_site(site_id, user)
    raw_ids = payload.get("issue_ids") or []
    issue_ids: list[uuid.UUID] = []
    for rid in raw_ids:
        try:
            issue_ids.append(uuid.UUID(str(rid)))
        except Exception:
            continue
    if not issue_ids:
        return {"items": []}

    async with async_session() as session:
        rows = (await session.execute(
            select(Issue.id, Issue.page_id, Page.url, Issue.viewport, Issue.bbox, Issue.scan_id)
            .join(Scan, Issue.scan_id == Scan.id)
            .join(Page, Issue.page_id == Page.id)
            .where(Issue.id.in_(issue_ids), Scan.site_id == site_id)
        )).all()

    items = [
        {
            "id": str(issue_id),
            "page_id": str(page_id),
            "page_url": page_url,
            "scan_id": str(scan_id),
            "viewport": viewport,
            "has_bbox": bbox is not None,
        }
        for issue_id, page_id, page_url, viewport, bbox, scan_id in rows
    ]
    items.sort(key=lambda x: (x["page_url"], x["id"]))
    return {"items": items}


def _grammar_payload(snippet: str | None) -> dict | None:
    """Parse the JSON grammar payload stored in Issue.html_snippet."""
    if not snippet:
        return None
    try:
        data = json.loads(snippet)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


@router.get("/{site_id}/checks/grammar/issues")
async def list_grammar_issues(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    """Grammar findings for the latest completed scan, aggregated by
    (rule_id, error_text) and grouped by Silktide group. Approved/ignored issues
    are excluded (they carry is_approved/is_ignored flags)."""
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"total_issue_count": 0, "lang_codes_detected": [], "groups": []}
        scan_id = str(latest.id)
        rows = (await session.execute(
            select(Issue.id, Issue.html_snippet, Issue.page_id, Page.url)
            .join(Page, Issue.page_id == Page.id)
            .where(
                Issue.scan_id == latest.id, Issue.rule_id == "grammar",
                Issue.is_approved.is_(False), Issue.is_ignored.is_(False),
            )
        )).all()

    # Aggregate identical (rule_id, error_text) occurrences across pages.
    agg: dict[tuple[str, str], dict] = {}
    lang_codes: set[str] = set()
    for issue_id, snippet, page_id, page_url in rows:
        p = _grammar_payload(snippet)
        if p is None:
            continue
        rid = p.get("rule_id") or ""
        etext = p.get("error_text") or ""
        if p.get("lang_code"):
            lang_codes.add(p["lang_code"])
        key = (rid, etext)
        entry = agg.get(key)
        if entry is None:
            entry = {
                "id": str(issue_id),
                "rule_id": rid,
                "excerpt": p.get("excerpt", ""),
                "corrected_excerpt": p.get("corrected_excerpt"),
                "error_text": etext,
                "replacement": p.get("replacement"),
                "source_type": p.get("source_type", "visible"),
                "page_url": page_url,
                "page_id": str(page_id),
                "scan_id": scan_id,
                "quantity": 0,
                "_group": p.get("silktide_group", "Grammar issue"),
                "_severity": p.get("severity", "warning"),
                "_rule_id": rid,
            }
            agg[key] = entry
        entry["quantity"] += 1

    # Group aggregated entries by Silktide group name.
    groups_map: dict[str, dict] = {}
    for entry in agg.values():
        g = groups_map.get(entry["_group"])
        if g is None:
            g = {"group_name": entry["_group"], "severity": entry["_severity"],
                 "rule_ids": set(), "issues": []}
            groups_map[entry["_group"]] = g
        g["rule_ids"].add(entry["_rule_id"])
        g["issues"].append({k: v for k, v in entry.items() if not k.startswith("_")})

    sev_rank = {"error": 0, "warning": 1}
    groups = []
    for g in groups_map.values():
        g["issues"].sort(key=lambda x: -x["quantity"])
        g["rule_ids"] = sorted(g["rule_ids"])
        groups.append(g)
    groups.sort(key=lambda g: (sev_rank.get(g["severity"], 2), g["group_name"]))

    total = sum(len(g["issues"]) for g in groups)
    return {"total_issue_count": total, "lang_codes_detected": sorted(lang_codes), "groups": groups}


async def _flag_grammar_issues(session, site_id: uuid.UUID, match: str, by_field: str, values: dict) -> int:
    """Set flags on grammar Issues in the latest scan whose payload `by_field`
    equals `match`. Returns the number updated."""
    latest = await _latest_done_scan(session, site_id)
    if latest is None:
        return 0
    rows = (await session.execute(
        select(Issue.id, Issue.html_snippet).where(Issue.scan_id == latest.id, Issue.rule_id == "grammar")
    )).all()
    ids = [iid for iid, snip in rows if (_grammar_payload(snip) or {}).get(by_field) == match]
    if ids:
        await session.execute(Issue.__table__.update().where(Issue.id.in_(ids)).values(**values))
    return len(ids)


@router.post("/{site_id}/checks/grammar/approve")
async def approve_grammar(site_id: uuid.UUID, payload: dict, user: User = Depends(get_current_user)) -> dict:
    """Approve a grammar error site-wide (by exact text). Future scans skip it;
    matching issues in the current scan are flagged approved immediately."""
    await authorize_site(site_id, user)
    error_text = (payload.get("error_text") or "").strip()
    if not error_text:
        raise HTTPException(400, "error_text required")
    async with async_session() as session:
        exists = (await session.execute(
            select(ApprovedGrammar.id).where(
                ApprovedGrammar.site_id == site_id, ApprovedGrammar.error_text == error_text
            )
        )).first()
        if not exists:
            session.add(ApprovedGrammar(site_id=site_id, error_text=error_text, approved_by=user.id))
        updated = await _flag_grammar_issues(
            session, site_id, error_text, "error_text", {"is_approved": True, "reviewed": True}
        )
        await session.commit()
    return {"ok": True, "approved_text": error_text, "updated": updated}


@router.post("/{site_id}/checks/grammar/ignore-rule")
async def ignore_grammar_rule(site_id: uuid.UUID, payload: dict, user: User = Depends(get_current_user)) -> dict:
    """Ignore an entire LanguageTool rule site-wide. Future scans drop it;
    matching issues in the current scan are flagged ignored immediately."""
    await authorize_site(site_id, user)
    rule_id = (payload.get("rule_id") or "").strip()
    if not rule_id:
        raise HTTPException(400, "rule_id required")
    async with async_session() as session:
        exists = (await session.execute(
            select(IgnoredGrammarRule.id).where(
                IgnoredGrammarRule.site_id == site_id, IgnoredGrammarRule.rule_id == rule_id
            )
        )).first()
        if not exists:
            session.add(IgnoredGrammarRule(site_id=site_id, rule_id=rule_id, ignored_by=user.id))
        updated = await _flag_grammar_issues(
            session, site_id, rule_id, "rule_id", {"is_ignored": True, "reviewed": True}
        )
        await session.commit()
    return {"ok": True, "rule_id": rule_id, "updated": updated}


def _spellchecker() -> SpellChecker:
    return SpellChecker(distance=1)


@router.get("/{site_id}/privacy/overview")
async def privacy_overview(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    """Everything the Privacy overview draws.

    Consent, audit and security are presentation groupings rather than scored
    categories, so each is the mean of its own checks for that run — the same
    rule every other sub-view uses.
    """
    await authorize_site(site_id, user)
    groups = ("consent", "audit", "security")
    async with async_session() as session:
        scans = (await session.execute(
            select(Scan.id, Scan.finished_at, Scan.created_at, Scan.category_scores)
            .where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.asc())
        )).all()
        if not scans:
            raise HTTPException(status_code=404, detail="No completed scan yet")

        members = {rule_id for group in groups for rule_id in MODULE_CHECK_ORDER[group]}
        score_rows = (await session.execute(
            select(CheckScoreRow.scan_id, CheckScoreRow.rule_id, CheckScoreRow.check_score)
            .where(
                CheckScoreRow.scan_id.in_([row[0] for row in scans]),
                CheckScoreRow.rule_id.in_(list(members)),
                CheckScoreRow.check_score.is_not(None),
            )
        )).all()

    by_scan: dict[uuid.UUID, dict[str, float]] = defaultdict(dict)
    for scan_id, rule_id, score in score_rows:
        by_scan[scan_id][rule_id] = float(score)

    def _group_score(scan_id: uuid.UUID, group: str) -> float | None:
        listed = MODULE_CHECK_ORDER[group]
        values = [score for rule_id, score in by_scan.get(scan_id, {}).items() if rule_id in listed]
        return round(sum(values) / len(values), 1) if values else None

    history = [
        {
            "at": (finished or created).isoformat(),
            "score": (category_scores or {}).get("privacy"),
            **{group: _group_score(scan_id, group) for group in groups},
        }
        for scan_id, finished, created, category_scores in scans
    ]

    def _latest_with_delta(key: str) -> dict:
        values = [point[key] for point in history if point[key] is not None]
        if not values:
            return {"score": None, "delta": None}
        return {
            "score": values[-1],
            "delta": round(values[-1] - values[-2], 2) if len(values) > 1 else None,
        }

    return {
        "score": (scans[-1][3] or {}).get("privacy"),
        "groups": {group: _latest_with_delta(group) for group in groups},
        "history": history,
    }


def _phone_key(raw: str) -> str:
    """The number in E.164, so the same number written differently groups as one."""
    try:
        import phonenumbers

        parsed = phonenumbers.parse(raw, "US")
        if phonenumbers.is_possible_number(parsed):
            return phonenumbers.format_number(parsed, phonenumbers.PhoneNumberFormat.E164)
    except Exception:
        pass
    return "".join(character for character in raw if character.isdigit()) or raw


def _is_callable_number(raw: str) -> bool:
    """Whether this is a number someone could actually dial.

    Text extraction — especially from PDFs, where a line break can swallow
    digits — throws up strings shaped like phone numbers that are not one:
    ``000.692.6877``, or a ``806-000-0000`` placeholder. libphonenumber knows
    which area codes and line numbers exist, so it decides.
    """
    try:
        import phonenumbers

        return phonenumbers.is_valid_number(phonenumbers.parse(raw, "US"))
    except Exception:
        return False


def _phone_details(raw: str) -> tuple[str, str, str]:
    """A number's presented form, where it is registered, and its country.

    Uses libphonenumber's own geocoding, so a number reports the area its code
    covers — a city where the code is that specific, the state where it is not,
    and nothing at all for toll-free ranges that cover a whole country.
    """
    try:
        import phonenumbers
        from phonenumbers import geocoder

        parsed = phonenumbers.parse(raw, "US")
        if not phonenumbers.is_possible_number(parsed):
            return raw, "", ""
        formatted = phonenumbers.format_number(
            parsed, phonenumbers.PhoneNumberFormat.INTERNATIONAL
        )
        return (
            formatted,
            geocoder.description_for_number(parsed, "en") or "",
            phonenumbers.region_code_for_number(parsed) or "",
        )
    except Exception:
        return raw, "", ""


async def _exposed_values(
    site_id: uuid.UUID,
    rule_id: str,
    payload_key: str,
    normalise: Callable[[str], str] | None = None,
) -> tuple[str | None, list[dict]]:
    """Every distinct value this check found, and where each one appears.

    The same address or number usually appears on many pages — a contact in a
    footer, a switchboard number in a header — so identical values collapse into
    one row carrying the number of pages it appears on. ``normalise`` decides
    what counts as identical: one number written "806-742-2011" on one page and
    "+1 806 742 2011" on another is the same number, and must not split in two.
    """
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            raise HTTPException(status_code=404, detail="No completed scan yet")
        rows = (await session.execute(
            select(Issue.id, Issue.html_snippet, Issue.page_id, Page.url)
            .join(Page, Page.id == Issue.page_id)
            .where(
                Issue.scan_id == latest.id,
                Issue.rule_id == rule_id,
                Issue.reviewed.is_(False),
            )
        )).all()

    found: dict[str, dict] = {}
    for issue_id, snippet, page_id, page_url in rows:
        try:
            payload = json.loads(snippet) if isinstance(snippet, str) else (snippet or {})
        except (TypeError, ValueError):
            continue
        counted: set[str] = set()
        for value in payload.get(payload_key) or []:
            key = normalise(value) if normalise else value
            if not key:
                continue
            entry = found.setdefault(key, {
                "value": value, "quantity": 0, "issue_ids": [], "pages": [],
            })
            # One number written two ways on the same page — printed in the text
            # and again in a tel: link — is still one page using that number.
            if key in counted:
                continue
            counted.add(key)
            entry["quantity"] += 1
            entry["issue_ids"].append(str(issue_id))
            if len(entry["pages"]) < 50:
                entry["pages"].append({"page_id": str(page_id), "page_url": page_url})

    ordered = sorted(found.values(), key=lambda row: row["quantity"], reverse=True)
    return str(latest.id), ordered


@router.get("/{site_id}/privacy/phone-numbers")
async def privacy_phone_numbers(
    site_id: uuid.UUID, user: User = Depends(get_current_user)
) -> dict:
    """Publicly visible phone numbers, with where each one is registered."""
    await authorize_site(site_id, user)
    scan_id, values = await _exposed_values(
        site_id, "phone_numbers_exposed", "phone_numbers", normalise=_phone_key
    )
    values = [row for row in values if _is_callable_number(row["value"])]
    for row in values:
        formatted, location, country = _phone_details(row["value"])
        row["formatted"] = formatted
        row["location"] = location
        row["country"] = country
    return {"scan_id": scan_id, "numbers": values}


@router.get("/{site_id}/privacy/emails")
async def privacy_emails(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    """Publicly visible email addresses, grouped with the host that receives them."""
    await authorize_site(site_id, user)
    scan_id, values = await _exposed_values(
        site_id, "email_addresses_exposed", "email_addresses", normalise=str.lower
    )
    for row in values:
        _, _, hostname = row["value"].rpartition("@")
        row["hostname"] = hostname.lower()
    return {"scan_id": scan_id, "emails": values}


@router.get("/{site_id}/privacy/forms")
async def privacy_forms(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    """Every distinct form on the site, with the fields a visitor fills in.

    The same form usually appears on many pages — a site-wide search box, a
    newsletter sign-up in the footer. Identical forms are collapsed into one row
    carrying the number of pages it appears on, so a reviewer reads each form
    once rather than once per page.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            raise HTTPException(status_code=404, detail="No completed scan yet")
        rows = (await session.execute(
            select(Issue.id, Issue.html_snippet, Issue.page_id, Page.url)
            .join(Page, Page.id == Issue.page_id)
            .where(
                Issue.scan_id == latest.id,
                Issue.rule_id == "form_data_review",
                Issue.reviewed.is_(False),
            )
        )).all()

    forms: dict[str, dict] = {}
    for issue_id, snippet, page_id, page_url in rows:
        try:
            payload = json.loads(snippet) if isinstance(snippet, str) else (snippet or {})
        except (TypeError, ValueError):
            continue
        for form in payload.get("forms") or []:
            fields = form.get("fields") or []
            # Two forms are the same form when a visitor would fill in the same
            # boxes; the action tells apart look-alikes that submit elsewhere.
            signature = json.dumps(
                {
                    "action": form.get("action", ""),
                    "fields": [(f.get("label", ""), bool(f.get("required")), f.get("type", "")) for f in fields],
                },
                sort_keys=True,
            )
            entry = forms.setdefault(signature, {
                "signature": str(abs(hash(signature))),
                "action": form.get("action", ""),
                "method": form.get("method", ""),
                "sensitive_fields": form.get("sensitive_fields", []),
                "field_count": form.get("field_count", len(fields)),
                "fields": fields,
                "quantity": 0,
                "issue_ids": [],
                "pages": [],
            })
            entry["quantity"] += 1
            entry["issue_ids"].append(str(issue_id))
            if len(entry["pages"]) < 50:
                entry["pages"].append({"page_id": str(page_id), "page_url": page_url})

    ordered = sorted(forms.values(), key=lambda form: form["quantity"], reverse=True)
    return {"scan_id": str(latest.id), "forms": ordered}


@router.get("/{site_id}/ux/web-vitals")
async def web_vitals(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    """Web Vitals for the site's front door, per kind of visitor, plus history.

    The headline figures are the worst experience measured — a page that is fine
    on a desktop and slow on a phone is slow for the people on phones.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        scans = (await session.execute(
            select(Scan.finished_at, Scan.created_at, Scan.metrics)
            .where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.asc())
        )).all()
        if not scans:
            raise HTTPException(status_code=404, detail="No completed scan yet")

    def _score(metrics: dict | None) -> int | None:
        runs = (metrics or {}).get("web_vitals") or []
        scores = [run["score"] for run in runs if run.get("score") is not None]
        return min(scores) if scores else None

    history = [
        {"at": (finished or created).isoformat(), "score": _score(metrics)}
        for finished, created, metrics in scans
    ]

    latest = (scans[-1][2] or {}).get("web_vitals") or []
    # Frames are only wanted for the experience filmstrips, not the headline.
    worst = min(
        (run for run in latest if run.get("score") is not None),
        key=lambda run: run["score"],
        default=None,
    )
    scored = [point["score"] for point in history if point["score"] is not None]
    delta = round(scored[-1] - scored[-2], 2) if len(scored) > 1 else None

    return {
        "score": scored[-1] if scored else None,
        "delta": delta,
        "metrics": {
            "largest_contentful_paint_ms": (worst or {}).get("largest_contentful_paint_ms"),
            "first_input_delay_ms": (worst or {}).get("first_input_delay_ms"),
            "cumulative_layout_shift": (worst or {}).get("cumulative_layout_shift"),
        },
        "experiences": latest,
        "history": history,
    }


@router.get("/{site_id}/marketing/amount-of-content")
async def amount_of_content(
    site_id: uuid.UUID, user: User = Depends(get_current_user)
) -> dict:
    """How much content the site carries, and how that has moved across runs.

    Words and sentences are summed from the pages of each run; words per page
    divides by the pages that were actually measured, so adding empty documents
    does not quietly drag the average down.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        scans = (await session.execute(
            select(Scan.id, Scan.finished_at, Scan.created_at)
            .where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.asc())
        )).all()
        if not scans:
            raise HTTPException(status_code=404, detail="No completed scan yet")

        # Summed from the pages themselves rather than the run's stored metrics,
        # so runs that predate a metric still report what can be derived.
        totals = {
            scan_id: (int(words or 0), int(sentences or 0), int(measured or 0))
            for scan_id, words, sentences, measured in (await session.execute(
                select(
                    Page.scan_id,
                    func.sum(Page.word_count),
                    func.sum(Page.sentence_count),
                    func.count(Page.id).filter(Page.word_count.is_not(None)),
                )
                .where(
                    Page.scan_id.in_([row[0] for row in scans]),
                    Page.render_status == "ok",
                )
                .group_by(Page.scan_id)
            )).all()
        }

    history = []
    for scan_id, finished, created in scans:
        words, sentences, measured = totals.get(scan_id, (0, 0, 0))
        history.append({
            "at": (finished or created).isoformat(),
            "words": words or None,
            "sentences": sentences or None,
            "words_per_page": round(words / measured, 1) if words and measured else None,
        })

    def _latest(key: str):
        values = [point[key] for point in history if point[key] is not None]
        return values[-1] if values else None

    return {
        "totals": {
            "words": _latest("words"),
            "sentences": _latest("sentences"),
            "words_per_page": _latest("words_per_page"),
        },
        "history": history,
    }


@router.get("/{site_id}/marketing/overview")
async def marketing_overview(
    site_id: uuid.UUID, user: User = Depends(get_current_user)
) -> dict:
    """Everything the Marketing overview draws, from the site's run history.

    The two halves — content optimization and technical optimization — are
    presentation groupings rather than scored categories, so each is the mean of
    its own checks for that run, the same rule the Content sub-views use.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        scans = (await session.execute(
            select(Scan).where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.asc())
        )).scalars().all()
        if not scans:
            raise HTTPException(status_code=404, detail="No completed scan yet")

        scan_ids = [scan.id for scan in scans]
        score_rows = (await session.execute(
            select(CheckScoreRow.scan_id, CheckScoreRow.rule_id, CheckScoreRow.check_score)
            .where(
                CheckScoreRow.scan_id.in_(scan_ids),
                CheckScoreRow.rule_id.in_(list(MODULE_CHECK_ORDER["marketing"])),
                CheckScoreRow.check_score.is_not(None),
            )
        )).all()

    by_scan: dict[uuid.UUID, dict[str, float]] = defaultdict(dict)
    for scan_id, rule_id, score in score_rows:
        by_scan[scan_id][rule_id] = float(score)

    def _group_score(scan_id: uuid.UUID, module: str) -> float | None:
        members = MODULE_CHECK_ORDER[module]
        values = [score for rule_id, score in by_scan.get(scan_id, {}).items() if rule_id in members]
        return round(sum(values) / len(values), 1) if values else None

    history = []
    for scan in scans:
        history.append({
            "at": (scan.finished_at or scan.created_at).isoformat(),
            "score": (scan.category_scores or {}).get("marketing"),
            "content_optimization": _group_score(scan.id, "content-optimization"),
            "technical_optimization": _group_score(scan.id, "technical-optimization"),
            "words": (scan.metrics or {}).get("total_word_count"),
        })

    def _latest_with_delta(key: str) -> dict:
        values = [(point["at"], point[key]) for point in history if point[key] is not None]
        if not values:
            return {"score": None, "delta": None}
        current = values[-1][1]
        previous = values[-2][1] if len(values) > 1 else None
        return {
            "score": current,
            "delta": None if previous is None else round(current - previous, 2),
        }

    words = [point["words"] for point in history if point["words"] is not None]
    return {
        "score": (scans[-1].category_scores or {}).get("marketing"),
        "groups": {
            "content_optimization": _latest_with_delta("content_optimization"),
            "technical_optimization": _latest_with_delta("technical_optimization"),
        },
        "words": {"total": words[-1] if words else None},
        "history": history,
    }


def _check_display_name(rule_id: str) -> str:
    """A check's presented name: a module's wording, else the catalog's, else
    the rule's own id made readable (engine rules we do not list ourselves)."""
    listed = listed_display_name(rule_id)
    if listed:
        return listed
    entry = _CHECK_BY_ID.get(rule_id)
    if entry is not None and entry.display_name:
        return entry.display_name
    return rule_id.replace("-", " ").replace("_", " ").capitalize()


@router.get("/{site_id}/accessibility/overview")
async def accessibility_overview(
    site_id: uuid.UUID, user: User = Depends(get_current_user)
) -> dict:
    """Everything the Accessibility overview draws, from the latest run.

    One call rather than six: the screen needs the headline score and its
    history, the three conformance levels and theirs, which checks produce the
    most findings, how issues spread by crawl depth, and who the failures
    affect.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        scans = (await session.execute(
            select(Scan).where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.asc())
        )).scalars().all()
        if not scans:
            raise HTTPException(status_code=404, detail="No completed scan yet")
        latest = scans[-1]

        # Findings per accessibility check on the latest run. Review items are
        # excluded: the chart is about what is failing, not what needs a look.
        issue_rows = (await session.execute(
            select(Issue.rule_id, func.count(Issue.id))
            .where(
                Issue.scan_id == latest.id,
                Issue.category == "accessibility",
                Issue.manual_review.is_(False),
                Issue.reviewed.is_(False),
            )
            .group_by(Issue.rule_id)
        )).all()

        # Issues per page by crawl depth, for the average-per-page chart.
        depth_rows = (await session.execute(
            select(Page.depth, func.count(func.distinct(Page.id)))
            .where(
                Page.scan_id == latest.id,
                Page.render_status == "ok",
                Page.is_document.is_not(True),
            )
            .group_by(Page.depth)
        )).all()
        depth_issue_rows = (await session.execute(
            select(Page.depth, func.count(Issue.id))
            .select_from(Page)
            .join(Issue, Issue.page_id == Page.id)
            .where(
                Page.scan_id == latest.id,
                Page.render_status == "ok",
                Page.is_document.is_not(True),
                Issue.category == "accessibility",
                Issue.manual_review.is_(False),
                Issue.reviewed.is_(False),
            )
            .group_by(Page.depth)
        )).all()

        # Failing checks, for the who-is-affected cards.
        failing = (await session.execute(
            select(CheckScoreRow.criterion_id)
            .where(
                CheckScoreRow.scan_id == latest.id,
                CheckScoreRow.category == "accessibility",
                CheckScoreRow.check_score < 100,
            )
        )).scalars().all()

    def _level(key: str, column: str) -> dict:
        current = (latest.wcag_scores or {}).get(key)
        if current is None:
            current = getattr(latest, column, None)
        previous = None
        for scan in reversed(scans[:-1]):
            candidate = (scan.wcag_scores or {}).get(key)
            if candidate is None:
                candidate = getattr(scan, column, None)
            if candidate is not None:
                previous = candidate
                break
        return {
            "score": current,
            "delta": None if current is None or previous is None else round(current - previous, 2),
        }

    named = sorted(
        (
            {"rule_id": rule_id, "name": _check_display_name(rule_id), "issues": int(total)}
            for rule_id, total in issue_rows
            if total
        ),
        key=lambda row: row["issues"],
        reverse=True,
    )
    top = named[:4]
    remainder = sum(row["issues"] for row in named[4:])
    if remainder:
        top.append({"rule_id": "__other__", "name": "Other", "issues": remainder})

    pages_by_depth = {int(depth): int(n) for depth, n in depth_rows}
    issues_by_depth = {int(depth): int(n) for depth, n in depth_issue_rows}
    total_pages = sum(pages_by_depth.values())
    total_issues = sum(issues_by_depth.values())

    def _depth_label(depth: int) -> str:
        if depth == 0:
            return "Homepage"
        return f"{depth} click away" if depth == 1 else f"{depth} clicks away"

    per_page = [{
        "label": "All pages",
        "average": round(total_issues / total_pages, 1) if total_pages else 0.0,
        "pages": total_pages,
        "is_total": True,
    }]
    for depth in sorted(pages_by_depth):
        pages = pages_by_depth[depth]
        per_page.append({
            "label": _depth_label(depth),
            "average": round(issues_by_depth.get(depth, 0) / pages, 1) if pages else 0.0,
            "pages": pages,
            "is_total": False,
        })

    group_counts = {name: 0 for name, _ in DISABILITY_GROUPS}
    for criterion_id in failing:
        for name in groups_for(criterion_id):
            group_counts[name] += 1

    return {
        "score": (latest.category_scores or {}).get("accessibility"),
        "levels": {
            "a": _level("wcag-22-a", "score_a"),
            "aa": _level("wcag-22-aa", "score_aa"),
            "aaa": _level("wcag-22-aaa", "score_aaa"),
        },
        "history": [
            {
                "at": (scan.finished_at or scan.created_at).isoformat(),
                "score": (scan.category_scores or {}).get("accessibility"),
                "a": (scan.wcag_scores or {}).get("wcag-22-a", scan.score_a),
                "aa": (scan.wcag_scores or {}).get("wcag-22-aa", scan.score_aa),
                "aaa": (scan.wcag_scores or {}).get("wcag-22-aaa", scan.score_aaa),
            }
            for scan in scans
        ],
        "common_issues": top,
        "issues_per_page": per_page,
        "disability_groups": [
            {"group": name, "failing_checks": group_counts[name]} for name, _ in DISABILITY_GROUPS
        ],
    }


@router.get("/{site_id}/modules/{module}/history")
async def module_history(
    site_id: uuid.UUID, module: str, user: User = Depends(get_current_user)
) -> dict:
    """A module's own score across the site's completed runs, oldest first.

    Sub-views of Content (content accessibility, content SEO) are presentation
    lists, not scored categories, so no run carries a score for them. Rather
    than borrow the parent category's score and label it as theirs, the score
    here is the mean of the module's own checks for that run. Checks with no
    score row (review items, findings on documents) are left out of the mean
    instead of counting as zero.
    """
    await authorize_site(site_id, user)
    rule_ids = MODULE_CHECK_ORDER.get(module)
    if not rule_ids:
        raise HTTPException(status_code=404, detail="Unknown module")

    async with async_session() as session:
        scans = (await session.execute(
            select(Scan.id, Scan.finished_at, Scan.created_at)
            .where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.asc())
        )).all()
        if not scans:
            return {"module": module, "points": []}

        rows = (await session.execute(
            select(CheckScoreRow.scan_id, CheckScoreRow.check_score)
            .where(
                CheckScoreRow.scan_id.in_([row[0] for row in scans]),
                CheckScoreRow.rule_id.in_(list(rule_ids)),
                CheckScoreRow.check_score.is_not(None),
            )
        )).all()

    scored: dict[uuid.UUID, list[float]] = defaultdict(list)
    for scan_id, score in rows:
        scored[scan_id].append(float(score))

    points = []
    for scan_id, finished, created in scans:
        values = scored.get(scan_id)
        if not values:
            continue
        points.append({
            "scan_id": str(scan_id),
            "at": (finished or created).isoformat(),
            "score": round(sum(values) / len(values), 1),
            "checks_scored": len(values),
        })
    return {"module": module, "points": points}


@router.get("/{site_id}/checks/{check_id}/history")
async def check_history(
    site_id: uuid.UUID, check_id: str, user: User = Depends(get_current_user)
) -> dict:
    """Issue count and score for one check across the site's completed runs.

    Feeds the "number of issues over time" chart, oldest run first. Runs that
    predate a check produce no row rather than a zero, so a newly added check
    does not appear to have been fixed.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        scans = (await session.execute(
            select(Scan.id, Scan.finished_at, Scan.created_at)
            .where(Scan.site_id == site_id, Scan.status == "done")
            .order_by(Scan.created_at.asc())
        )).all()
        if not scans:
            return {"check_id": check_id, "points": []}

        scan_ids = [row[0] for row in scans]
        counts = {
            scan_id: int(n)
            for scan_id, n in (await session.execute(
                select(Issue.scan_id, func.count(Issue.id))
                .where(Issue.scan_id.in_(scan_ids), Issue.rule_id == check_id)
                .group_by(Issue.scan_id)
            )).all()
        }
        scores = {
            scan_id: score
            for scan_id, score in (await session.execute(
                select(CheckScoreRow.scan_id, CheckScoreRow.check_score)
                .where(CheckScoreRow.scan_id.in_(scan_ids), CheckScoreRow.rule_id == check_id)
            )).all()
        }

    points = [
        {
            "scan_id": str(scan_id),
            "at": (finished or created).isoformat(),
            "issues": counts.get(scan_id, 0),
            "score": scores.get(scan_id),
        }
        for scan_id, finished, created in scans
    ]
    return {"check_id": check_id, "points": points}


@router.get("/{site_id}/checks/{check_id}/words")
async def list_check_words(site_id: uuid.UUID, check_id: str, user: User = Depends(get_current_user)) -> dict:
    """Derived data for checks that produce word-level flags (currently spelling).

    Groups Issue rows (latest run) by the word stored in Issue.html_snippet.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"scan_id": None, "items": []}

        # Back-compat: allow spelling check_id to be passed as anything like "spelling".
        rule = check_id

        rows = (await session.execute(
            select(Issue.id, Issue.html_snippet, Issue.page_id, Page.url)
            .join(Page, Issue.page_id == Page.id)
            .where(
                Issue.scan_id == latest.id,
                Issue.manual_review.is_(False),
                Issue.reviewed.is_(False),
                Issue.rule_id == rule,
            )
        )).all()

    grouped: dict[str, dict] = defaultdict(lambda: {
        "quantity": 0,
        "issue_ids": [],
        "page_urls": [],
        "page_ids": set(),
        # One entry per page carrying this word, each with an issue that is
        # actually on that page. The three lists above group differently — every
        # issue, a sorted set, first-seen order — so pairing them by index links
        # an issue to the wrong page and the inspector then finds nothing.
        "pages": {},
        "example_issue_id": None,
        "example_page_id": None,
        "example_page_url": None,
        "category": "potential",
        "suggestion": None,
        "language": None,
    })
    for issue_id, snippet, page_id, page_url in rows:
        # The check stores a JSON payload; older rows stored the bare word.
        payload: dict = {}
        try:
            parsed = json.loads(snippet or "")
            if isinstance(parsed, dict):
                payload = parsed
        except (TypeError, ValueError):
            payload = {}
        word = str(payload.get("word") or (snippet or "")).strip() or "(unknown)"

        g = grouped[word]
        g["quantity"] += 1
        g["issue_ids"].append(str(issue_id))
        g["page_ids"].add(str(page_id))
        g["pages"].setdefault(str(page_id), {
            "page_id": str(page_id), "page_url": page_url, "issue_id": str(issue_id),
        })
        if payload:
            g["category"] = payload.get("category") or g["category"]
            g["suggestion"] = payload.get("suggestion") or g["suggestion"]
            g["language"] = payload.get("language") or g["language"]
        if page_url not in g["page_urls"]:
            g["page_urls"].append(page_url)
        if g["example_page_id"] is None:
            g["example_issue_id"] = str(issue_id)
            g["example_page_id"] = str(page_id)
            g["example_page_url"] = page_url

    #: Worst first, so a reviewer meets real errors before brand names.
    category_rank = {"likely": 0, "incorrect_case": 1, "different_language": 2, "potential": 3}

    items = []
    for word, g in grouped.items():
        suggestion = g.get("suggestion")
        items.append({
            "word": word,
            "category": g["category"],
            "suggestions": [suggestion] if suggestion else [],
            "language": g.get("language"),
            "page_ids": sorted(g.get("page_ids") or set()),
            "pages": list((g.get("pages") or {}).values()),
            **{
                k: v for k, v in g.items()
                if k not in {"page_ids", "pages", "category", "suggestion", "language"}
            },
        })

    items.sort(key=lambda x: (
        category_rank.get(str(x.get("category")), 9),
        -int(x.get("quantity") or 0),
        str(x.get("word") or "").lower(),
    ))
    return {"scan_id": str(latest.id), "check_id": check_id, "items": items}


@router.get("/{site_id}/checks/{check_id}/links")
async def list_check_links(site_id: uuid.UUID, check_id: str, user: User = Depends(get_current_user)) -> dict:
    """Derived data for link-level checks (broken links).

    Groups Issue rows by URL stored in Issue.html_snippet.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"scan_id": None, "items": []}
        site = await session.get(Site, site_id)
        site_host = urlparse(site.root_url).netloc if site else ""

        rule = check_id
        rows = (await session.execute(
            select(Issue.id, Issue.html_snippet, Issue.description, Issue.page_id, Page.url)
            .join(Page, Issue.page_id == Page.id)
            .where(
                Issue.scan_id == latest.id,
                Issue.manual_review.is_(False),
                Issue.reviewed.is_(False),
                Issue.rule_id == rule,
            )
        )).all()

    def _parse_snippet(snippet: str | None) -> dict:
        raw = (snippet or "").strip()
        if not raw:
            return {"url": "(unknown)"}
        if raw.startswith("{"):
            try:
                j = json.loads(raw)
                if isinstance(j, dict) and isinstance(j.get("url"), str) and j["url"].strip():
                    return {
                        "url": j["url"].strip(),
                        "anchor_text": j.get("anchor_text") if isinstance(j.get("anchor_text"), str) else None,
                        "http_status": j.get("http_status") if isinstance(j.get("http_status"), int) else None,
                        "error_type": j.get("error_type") if isinstance(j.get("error_type"), str) else None,
                    }
            except Exception:
                pass
        return {"url": raw}

    grouped: dict[str, dict] = defaultdict(lambda: {
        "issue_ids": [],
        "page_urls": [],
        "page_ids": set(),
        "status_text": None,
        "http_status": None,
        "error_type": None,
        "anchor_text": None,
        "example_page_id": None,
        "example_page_url": None,
    })
    for issue_id, snippet, desc, page_id, page_url in rows:
        parsed = _parse_snippet(snippet)
        url = parsed.get("url") or "(unknown)"
        g = grouped[url]
        g["issue_ids"].append(str(issue_id))
        g["page_urls"].append(page_url)
        g["page_ids"].add(str(page_id))
        if g["example_page_id"] is None:
            g["example_page_id"] = str(page_id)
            g["example_page_url"] = page_url
        if g["status_text"] is None:
            g["status_text"] = desc
        if g["http_status"] is None and isinstance(parsed.get("http_status"), int):
            g["http_status"] = parsed["http_status"]
        if g["error_type"] is None and isinstance(parsed.get("error_type"), str):
            g["error_type"] = parsed["error_type"]
        if g["anchor_text"] is None and isinstance(parsed.get("anchor_text"), str) and parsed["anchor_text"].strip():
            g["anchor_text"] = parsed["anchor_text"].strip()

    items = []
    for url, g in grouped.items():
        host = urlparse(url).netloc
        link_type = "internal" if (host and host == site_host) else "external"
        # quantity: pages affected
        quantity = len(g["page_ids"])
        items.append({
            "url": url,
            "link_type": link_type,
            "status_text": g.get("status_text") or "Broken link",
            "http_status": g.get("http_status"),
            "error_type": g.get("error_type"),
            "anchor_text": g.get("anchor_text"),
            "quantity": quantity,
            "page_urls": list(dict.fromkeys(g["page_urls"])),
            "issue_ids": g["issue_ids"],
            "example_page_id": g.get("example_page_id"),
            "example_page_url": g.get("example_page_url"),
        })
    items.sort(key=lambda x: (-int(x.get("quantity") or 0), str(x.get("url") or "")))
    return {"scan_id": str(latest.id), "check_id": check_id, "items": items}


@router.get("/{site_id}/checks/{check_id}/links-full")
async def list_check_links_full(site_id: uuid.UUID, check_id: str, user: User = Depends(get_current_user)) -> dict:
    """Broken-links table with per-page mapping in one payload.

    Returns rows grouped by broken URL with the affected pages + Inspector deep links.
    """
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"scan_id": None, "check_id": check_id, "items": []}
        site = await session.get(Site, site_id)
        site_host = urlparse(site.root_url).netloc if site else ""

        rows = (await session.execute(
            select(
                Issue.id,
                Issue.html_snippet,
                Issue.description,
                Issue.page_id,
                Issue.viewport,
                Issue.bbox,
                Page.url,
                Page.score,
                Page.issue_count,
                Page.manual_review_count,
            )
            .join(Page, Issue.page_id == Page.id)
            .where(
                Issue.scan_id == latest.id,
                Issue.rule_id == check_id,
                Issue.manual_review.is_(False),
                Issue.reviewed.is_(False),
                Issue.is_ignored.is_(False),
            )
        )).all()

    def _parse_payload(snippet: str | None) -> dict:
        raw = (snippet or "").strip()
        if not raw:
            return {"url": "(unknown)"}
        if raw.startswith("{"):
            try:
                j = json.loads(raw)
                if isinstance(j, dict) and isinstance(j.get("url"), str) and j["url"].strip():
                    return {
                        "url": j["url"].strip(),
                        "anchor_text": j.get("anchor_text") if isinstance(j.get("anchor_text"), str) else None,
                        "http_status": j.get("http_status") if isinstance(j.get("http_status"), int) else None,
                        "error_type": j.get("error_type") if isinstance(j.get("error_type"), str) else None,
                    }
            except Exception:
                pass
        return {"url": raw}

    grouped: dict[str, dict] = defaultdict(lambda: {
        "url": "(unknown)",
        "link_type": "external",
        "status_text": None,
        "http_status": None,
        "error_type": None,
        "anchor_text": None,
        "pages": [],
        "_page_ids": set(),
    })

    for issue_id, snippet, desc, page_id, viewport, bbox, page_url, page_score, issue_count, manual_count in rows:
        p = _parse_payload(snippet)
        url = p.get("url") or "(unknown)"
        g = grouped[url]
        g["url"] = url
        host = urlparse(url).netloc
        g["link_type"] = "internal" if (host and host == site_host) else "external"
        if g["status_text"] is None:
            g["status_text"] = desc
        if g["http_status"] is None and isinstance(p.get("http_status"), int):
            g["http_status"] = p["http_status"]
        if g["error_type"] is None and isinstance(p.get("error_type"), str):
            g["error_type"] = p["error_type"]
        if g["anchor_text"] is None and isinstance(p.get("anchor_text"), str) and p["anchor_text"].strip():
            g["anchor_text"] = p["anchor_text"].strip()

        g["_page_ids"].add(str(page_id))
        g["pages"].append({
            "issue_id": str(issue_id),
            "page_id": str(page_id),
            "page_url": page_url,
            "page_score": page_score,
            "page_issue_count": int(issue_count or 0),
            "page_manual_review_count": int(manual_count or 0),
            "viewport": viewport,
            "has_bbox": bbox is not None,
        })

    items = []
    for _url, g in grouped.items():
        pages = g.get("pages") or []
        pages.sort(key=lambda x: (str(x.get("page_url") or ""), str(x.get("issue_id") or "")))
        items.append({
            "url": g["url"],
            "link_type": g["link_type"],
            "status_text": g.get("status_text") or "Broken link",
            "http_status": g.get("http_status"),
            "error_type": g.get("error_type"),
            "anchor_text": g.get("anchor_text"),
            "pages_affected": len(g.get("_page_ids") or set()),
            "instances": pages,
        })

    items.sort(key=lambda x: (-int(x.get("pages_affected") or 0), str(x.get("url") or "")))
    return {"scan_id": str(latest.id), "check_id": check_id, "items": items}


@router.get("/{site_id}/pdfs")
async def list_pdfs(
    site_id: uuid.UUID,
    category: str | None = None,
    user: User = Depends(get_current_user),
) -> dict:
    """Documents found in a site's latest run, with a per-document score.

    Every PDF check is assisted, so the site scoring engine deliberately ignores
    them and a document carries no engine score. A document's score here is its
    own pass rate: the share of the PDF checks it did not fail. Documents that
    could not be fetched or parsed produced no findings and score None rather
    than a misleading 100.
    """
    del category  # documents are the same set for every module that lists them
    await authorize_site(site_id, user)
    async with async_session() as session:
        latest = await _latest_done_scan(session, site_id)
        if latest is None:
            return {"scan_id": None, "pdfs": []}

        documents = (await session.execute(
            select(Page)
            .where(Page.scan_id == latest.id, Page.is_document.is_(True))
            .order_by(Page.url.asc())
        )).scalars().all()

        failed_by_page: dict[uuid.UUID, set[str]] = defaultdict(set)
        for page_id, rule_id in (await session.execute(
            select(Issue.page_id, Issue.rule_id).where(
                Issue.scan_id == latest.id,
                Issue.reviewed.is_(False),
                Issue.rule_id.in_(PDF_CHECK_RULE_IDS),
            )
        )).all():
            failed_by_page[page_id].add(rule_id)

    total = len(PDF_CHECK_RULE_IDS)
    out = []
    for doc in documents:
        failed = failed_by_page.get(doc.id, set())
        # No findings at all means the document was never parsed, not a clean bill.
        parsed = bool(failed) or doc.manual_review_count > 0
        out.append({
            "page_id": str(doc.id),
            "title": doc.title,
            "url": doc.url,
            "score": round(100 * (total - len(failed)) / total) if parsed else None,
            "checks_total": total,
            "checks_failed": len(failed),
            "issue_count": doc.manual_review_count,
        })
    return {"scan_id": str(latest.id), "pdfs": out}


@router.get("/{site_id}/runs/{run_id}")
async def get_run(site_id: uuid.UUID, run_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    await authorize_site(site_id, user)
    async with async_session() as session:
        scan = await session.get(Scan, run_id)
        if scan is None or scan.site_id != site_id:
            raise HTTPException(404, "Run not found")
        pages = (await session.execute(
            select(Page).where(Page.scan_id == run_id).order_by(Page.depth, Page.url)
        )).scalars().all()
        diff = (await session.execute(
            select(RunDiff).where(RunDiff.scan_id == run_id)
        )).scalars().first()
    return {
        "scan_id": str(scan.id), "site_id": str(site_id),
        "created_at": scan.created_at.isoformat(),
        "finished_at": scan.finished_at.isoformat() if scan.finished_at else None,
        "overall_score": scan.overall_score, "overall_band": scan.overall_band,
        "category_scores": scan.category_scores or {}, "wcag_scores": scan.wcag_scores or {},
        "pages": [{
            "id": str(p.id), "url": p.url, "score": p.score,
            "issue_count": p.issue_count, "manual_review_count": p.manual_review_count,
            "last_changed_at": p.last_changed_at.isoformat() if p.last_changed_at else None,
            "render_unstable": p.render_unstable,
        } for p in pages],
        "diff": {
            "issues_new": diff.issues_new, "issues_resolved": diff.issues_resolved,
            "issues_unchanged": diff.issues_unchanged, "score_deltas": diff.score_deltas,
        } if diff else None,
    }


async def _run_fps_with_meta(session, scan_id: uuid.UUID) -> dict[str, dict]:
    rows = (await session.execute(
        select(Issue, Page.url).join(Page, Issue.page_id == Page.id)
        .where(Issue.scan_id == scan_id)
    )).all()
    out: dict[str, dict] = {}
    for i, url in rows:
        fp = issue_fingerprint(i.rule_id, url, i.selector, i.html_snippet)
        out[fp] = {"rule_id": i.rule_id, "page_url": url, "page_id": str(i.page_id),
                   "description": i.description, "impact": i.impact, "category": i.category,
                   "criterion_id": i.criterion_id}
    return out


@router.get("/{site_id}/compare")
async def compare_runs(
    site_id: uuid.UUID,
    a: uuid.UUID | None = Query(None),
    b: uuid.UUID | None = Query(None),
    runA: uuid.UUID | None = Query(None),
    runB: uuid.UUID | None = Query(None),
    user: User = Depends(get_current_user),
) -> dict:
    run_a_id, run_b_id = a or runA, b or runB
    if run_a_id is None or run_b_id is None:
        raise HTTPException(422, "Both a and b run IDs are required")
    await authorize_site(site_id, user)
    async with async_session() as session:
        scan_a = await session.get(Scan, run_a_id)
        scan_b = await session.get(Scan, run_b_id)
        if not scan_a or not scan_b or scan_a.site_id != site_id or scan_b.site_id != site_id:
            raise HTTPException(404, "Run not found")

        fps_a = await _run_fps_with_meta(session, run_a_id)
        fps_b = await _run_fps_with_meta(session, run_b_id)
        counts = diff_fingerprint_sets(set(fps_b), set(fps_a))
        stored_diff = (await session.execute(
            select(RunDiff).where(RunDiff.scan_id == run_b_id, RunDiff.prev_scan_id == run_a_id)
        )).scalars().first()

        pages_a = {normalize_url(p.url): p for p in (await session.execute(
            select(Page).where(Page.scan_id == run_a_id, Page.render_status == "ok", Page.is_document.is_(False))
        )).scalars().all()}
        pages_b = {normalize_url(p.url): p for p in (await session.execute(
            select(Page).where(Page.scan_id == run_b_id, Page.render_status == "ok", Page.is_document.is_(False))
        )).scalars().all()}

    new_scores = {**(scan_b.category_scores or {}), "overall": scan_b.overall_score}
    prev_scores = {**(scan_a.category_scores or {}), "overall": scan_a.overall_score}
    deltas = score_deltas(new_scores, prev_scores)
    category_deltas = {}
    for category in sorted(set(new_scores) | set(prev_scores)):
        if category == "overall":
            continue
        score_a, score_b = prev_scores.get(category), new_scores.get(category)
        category_deltas[category] = {
            "score_a": score_a, "score_b": score_b,
            "delta": float(score_b) - float(score_a) if score_a is not None and score_b is not None else None,
        }

    per_page = []
    for url in set(pages_a) | set(pages_b):
        pa, pb = pages_a.get(url), pages_b.get(url)
        score_a, score_b = pa.score if pa else None, pb.score if pb else None
        per_page.append({
            "url": (pb or pa).url,
            "score_a": score_a, "score_b": score_b,
            "score_delta": float(score_b) - float(score_a) if score_a is not None and score_b is not None else (float(score_b) if score_b is not None else -float(score_a) if score_a is not None else 0.0),
            "content_changed": bool(pa and pb and pa.content_hash != pb.content_hash),
            "is_new_page": pa is None and pb is not None,
            "is_removed_page": pa is not None and pb is None,
        })
    per_page.sort(key=lambda row: abs(row["score_delta"]), reverse=True)

    def issue_payload(meta: dict, include_scan: bool) -> dict:
        entry = _CHECK_BY_ID.get(meta["rule_id"])
        payload = {
            "rule_id": meta["rule_id"],
            "display_name": entry.display_name if entry else meta["rule_id"],
            "category": meta["category"],
            "severity": _sev_bucket(meta.get("impact")),
            "page_url": meta["page_url"],
        }
        if include_scan:
            payload.update({"page_id": meta["page_id"], "scan_id": str(run_b_id)})
        return payload

    new_fps, resolved_fps = set(fps_b) - set(fps_a), set(fps_a) - set(fps_b)

    return {
        "run_a": {"id": str(scan_a.id), "started_at": (scan_a.started_at or scan_a.created_at).isoformat(),
                  "page_count": len(pages_a), "overall_score": scan_a.overall_score, "category_scores": scan_a.category_scores or {}},
        "run_b": {"id": str(scan_b.id), "started_at": (scan_b.started_at or scan_b.created_at).isoformat(),
                  "page_count": len(pages_b), "overall_score": scan_b.overall_score, "category_scores": scan_b.category_scores or {}},
        "summary": {
            "overall_delta": deltas.get("overall"), "category_deltas": category_deltas,
            "issues_new": stored_diff.issues_new if stored_diff else counts.new,
            "issues_resolved": stored_diff.issues_resolved if stored_diff else counts.resolved,
            "issues_unchanged": stored_diff.issues_unchanged if stored_diff else counts.unchanged,
        },
        "pages": per_page,
        "issues_new_list": [issue_payload(fps_b[fp], True) for fp in new_fps][:50],
        "issues_resolved_list": [issue_payload(fps_a[fp], False) for fp in resolved_fps][:50],
        "total_new": len(new_fps), "total_resolved": len(resolved_fps),
    }


@router.post("/{site_id}/scan-now")
async def scan_now(site_id: uuid.UUID, request: Request, user: User = Depends(get_current_user)) -> dict:
    site = await authorize_site(site_id, user)
    async with async_session() as session:
        # Concurrency guard: never two active crawls of the same site. If one is
        # already running, return it so the caller can attach to its progress.
        active = (await session.execute(
            select(Scan).where(
                Scan.site_id == site_id, Scan.status.in_(["pending", "crawling", "scoring"])
            ).order_by(Scan.created_at.desc()).limit(1)
        )).scalars().first()
        if active is not None:
            return {"scan_id": str(active.id), "already_running": True}
        scan = Scan(
            root_url=site.root_url, site_id=site_id, trigger="manual",
            max_pages=site.max_pages, max_depth=site.max_depth,
            render_pool_size=settings.render_pool_size, ignore_patterns=site.ignore_patterns or [],
        )
        session.add(scan)
        await session.commit()
        scan_id = scan.id
    await request.app.state.arq_pool.enqueue_job("run_scan_job", str(scan_id))
    return {"scan_id": str(scan_id)}


@router.patch("/{site_id}")
async def update_site(site_id: uuid.UUID, payload: dict, user: User = Depends(require_admin)) -> dict:
    async with async_session() as session:
        site = await session.get(Site, site_id)
        if site is None:
            raise HTTPException(404, "Site not found")
        for field in ("name", "recrawl_interval_days", "force_rescan", "max_pages", "max_depth", "ignore_patterns"):
            if field in payload:
                setattr(site, field, payload[field])
        await session.commit()
    return {"ok": True}
