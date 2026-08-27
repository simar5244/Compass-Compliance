"""Instant single-page scans + their public read-only report.

An instant scan is just a normal scan run with max_pages=1 (the full engine on
one page), tagged is_instant and given a shareable report_slug. The create path
is rate-limited per IP; the report is served publicly at /r/{slug} and refuses
to resolve non-instant (platform) scans.

The authenticated platform APIs in api/scans.py are untouched.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, HTTPException, Request, Response
from sqlalchemy import select

from app.audit.axe_runner import _AXE_PATH  # noqa: F401 (kept for engine-version note)
from app.config import settings
from app.db import async_session
from app.models import Issue, Page, Scan
from app.ratelimit import InstantRateLimiter
from app.schemas import (
    InstantCreateOut,
    InstantReport,
    InstantScanRequest,
    PageDetail,
)
from app.api.page_detail import page_detail_from_rows
from app.util.slug import new_slug

router = APIRouter(tags=["instant"])

_ENGINE_VERSION = "axe-core 4.12.1 · TTU Accessibility Compass engine v3"

# Module-level so the window persists across requests within the API process.
_rate_limiter = InstantRateLimiter(
    max_requests=settings.instant_rate_max,
    window_seconds=settings.instant_rate_window_seconds,
)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    if fwd:
        return fwd.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


@router.post("/instant-scans", response_model=InstantCreateOut)
async def create_instant_scan(payload: InstantScanRequest, request: Request, response: Response) -> InstantCreateOut:
    ip = _client_ip(request)
    if not _rate_limiter.allow(ip):
        retry = _rate_limiter.retry_after(ip)
        response.headers["Retry-After"] = str(retry)
        raise HTTPException(429, f"Rate limit reached. Try again in {retry}s.")

    async with async_session() as session:
        scan = Scan(
            root_url=str(payload.url),
            max_pages=1, max_depth=0,
            render_pool_size=1,
            is_instant=True,
            report_slug=new_slug(),
            wcag_version=payload.wcag_version,
            wcag_level=payload.wcag_level,
        )
        session.add(scan)
        await session.commit()
        await session.refresh(scan)
        scan_id, slug = scan.id, scan.report_slug

    await request.app.state.arq_pool.enqueue_job("run_scan_job", str(scan_id))
    return InstantCreateOut(scan_id=scan_id, slug=slug)


async def _page_detail(page: Page) -> PageDetail:
    async with async_session() as session:
        issues = (await session.execute(
            select(Issue).where(Issue.page_id == page.id).order_by(Issue.category, Issue.rule_id)
        )).scalars().all()
    return page_detail_from_rows(page, list(issues))


@router.get("/check-config")
async def get_check_config() -> dict:
    """Threshold constants + per-check config the report UI shows, sourced from
    the engine's settings and scoring.yaml so displayed thresholds never drift."""
    from app.scoring.config import load_scoring_config

    cfg = load_scoring_config()
    return {
        "thresholds": {
            "target_min_px": settings.target_min_px,
            "reflow_viewport_width": settings.reflow_viewport_width,
            "focus_luminance_delta": settings.focus_luminance_delta,
            "focus_contrast_min_ratio": settings.focus_contrast_min_ratio,
            "contrast_aa_normal": 4.5,   # WCAG 1.4.3 constants
            "contrast_aa_large": 3.0,
        },
        "checks": {
            cid: {
                "category": q.category, "subcategory": q.subcategory,
                "worst_value": q.worst_value, "max_impact": q.max_impact,
            }
            for cid, q in cfg.quality_checks.items()
        },
        "check_overrides": cfg.check_overrides,
    }


@router.get("/r/{slug}", response_model=InstantReport)
async def get_instant_report(slug: str) -> InstantReport:
    async with async_session() as session:
        scan = (await session.execute(
            select(Scan).where(Scan.report_slug == slug)
        )).scalars().first()
        if scan is None or not scan.is_instant:
            raise HTTPException(404, "Report not found")
        page = (await session.execute(
            select(Page).where(Page.scan_id == scan.id, Page.render_status == "ok")
            .order_by(Page.scanned_at.desc())
        )).scalars().first()

    return InstantReport(
        slug=slug, scan_id=scan.id, url=scan.root_url, status=scan.status, error=scan.error,
        overall_score=scan.overall_score, overall_band=scan.overall_band,
        category_scores=scan.category_scores or {}, wcag_scores=scan.wcag_scores or {},
        wcag_version=scan.wcag_version, wcag_level=scan.wcag_level,
        created_at=scan.created_at, finished_at=scan.finished_at,
        engine_version=_ENGINE_VERSION,
        page=await _page_detail(page) if page else None,
    )
