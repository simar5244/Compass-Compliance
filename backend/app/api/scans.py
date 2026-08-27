from __future__ import annotations

import uuid
from collections import defaultdict

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import FileResponse
from sqlalchemy import func, select

from app.config import settings
from app.auth.deps import authorize_site, get_current_user
from app.db import async_session
from app.models import CheckScoreRow, Issue, Page, RetestJob, Scan, Site, User
from app.schemas import (
    CategoryNode,
    CheckScoreOut,
    CreateScanRequest,
    IssueGroup,
    IssueInstance,
    PageDetail,
    PageSummary,
    RetestJobOut,
    RetestRequest,
    ReviewRequest,
    ScanSummary,
    ScanTree,
)
from app.api.page_detail import page_detail_from_rows
from app.storage.artifacts import resolve_ref

router = APIRouter(prefix="/scans", tags=["scans"])
retest_router = APIRouter(tags=["retest"])


@router.post("/{scan_id}/retest", response_model=RetestJobOut)
async def create_retest(scan_id: uuid.UUID, payload: RetestRequest, request: Request) -> RetestJobOut:
    """Queue an instant single-URL retest; returns the job to poll."""
    async with async_session() as session:
        scan = await session.get(Scan, scan_id)
        if scan is None:
            raise HTTPException(404, "Scan not found")
        job = RetestJob(scan_id=scan_id, url=str(payload.url), state="queued")
        session.add(job)
        await session.commit()
        await session.refresh(job)
        job_id = job.id

    await request.app.state.arq_pool.enqueue_job("run_retest_job", str(job_id))

    async with async_session() as session:
        job = await session.get(RetestJob, job_id)
        return RetestJobOut.model_validate(job)


@retest_router.get("/retest-jobs/{job_id}", response_model=RetestJobOut)
async def get_retest_job(job_id: uuid.UUID) -> RetestJobOut:
    async with async_session() as session:
        job = await session.get(RetestJob, job_id)
        if job is None:
            raise HTTPException(404, "Retest job not found")
        return RetestJobOut.model_validate(job)


@retest_router.post("/issues/{issue_id}/review", response_model=dict)
async def review_issue(issue_id: uuid.UUID, payload: ReviewRequest) -> dict:
    """Mark a manual-review issue as reviewed (or un-review it)."""
    async with async_session() as session:
        issue = await session.get(Issue, issue_id)
        if issue is None:
            raise HTTPException(404, "Issue not found")
        issue.reviewed = payload.reviewed
        await session.commit()
        return {"id": str(issue_id), "reviewed": issue.reviewed}


@retest_router.post("/issues/{issue_id}/ignore", response_model=dict)
async def ignore_issue(issue_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    """Ignore one issue after verifying that it belongs to an accessible site."""
    async with async_session() as session:
        row = (await session.execute(
            select(Issue, Scan.site_id)
            .join(Scan, Issue.scan_id == Scan.id)
            .where(Issue.id == issue_id)
        )).first()
        if row is None:
            raise HTTPException(404, "Issue not found")
        issue, site_id = row
        if site_id is not None:
            await authorize_site(site_id, user)
        issue.reviewed = True
        issue.is_ignored = True
        await session.commit()
        return {"id": str(issue_id), "ignored": True}


def _normalize_root(url: str) -> str:
    """Compare site roots ignoring case and a trailing slash."""
    return (url or "").strip().rstrip("/").casefold()


async def _match_existing_site(session, url: str):
    """The tracked Site for this URL, or None.

    Deliberately does not create one: a site is something a person adds to the
    dashboard, and minting them from arbitrary scan requests would let anyone
    populate the site list.
    """
    target = _normalize_root(url)
    if not target:
        return None
    for site in (await session.execute(select(Site))).scalars().all():
        if _normalize_root(site.root_url) == target:
            return site
    return None


@router.post("", response_model=ScanSummary)
async def create_scan(payload: CreateScanRequest, request: Request) -> ScanSummary:
    async with async_session() as session:
        # Attach the run to the site it belongs to when we already track that
        # site. A scan with no site_id is invisible to every site screen —
        # checks, privacy, marketing, UX all read the site's latest scan — and
        # it skips the web-vitals capture, so scanning a tracked site from the
        # URL box looked like "run a scan to populate" even after running one.
        site = await _match_existing_site(session, str(payload.url))
        scan = Scan(
            root_url=str(payload.url),
            site_id=site.id if site else None,
            max_pages=payload.max_pages or settings.crawl_max_pages_default,
            max_depth=payload.max_depth or settings.crawl_max_depth_default,
            render_pool_size=settings.render_pool_size,
            ignore_patterns=payload.ignore_patterns or [],
            custom_dictionary=payload.custom_dictionary or [],
        )
        session.add(scan)
        await session.commit()
        await session.refresh(scan)
        scan_id = scan.id

    pool = request.app.state.arq_pool
    await pool.enqueue_job("run_scan_job", str(scan_id))

    async with async_session() as session:
        scan = await session.get(Scan, scan_id)
        return ScanSummary.model_validate(scan)


@router.get("", response_model=list[ScanSummary])
async def list_scans() -> list[ScanSummary]:
    async with async_session() as session:
        result = await session.execute(select(Scan).order_by(Scan.created_at.desc()).limit(50))
        return [ScanSummary.model_validate(s) for s in result.scalars()]


@router.get("/{scan_id}", response_model=ScanSummary)
async def get_scan(scan_id: uuid.UUID) -> ScanSummary:
    async with async_session() as session:
        scan = await session.get(Scan, scan_id)
        if scan is None:
            raise HTTPException(404, "Scan not found")
        return ScanSummary.model_validate(scan)


@router.get("/{scan_id}/pages", response_model=list[PageSummary])
async def get_scan_pages(scan_id: uuid.UUID) -> list[PageSummary]:
    async with async_session() as session:
        result = await session.execute(
            select(Page).where(Page.scan_id == scan_id).order_by(Page.depth, Page.url)
        )
        return [PageSummary.model_validate(p) for p in result.scalars()]


@router.get("/{scan_id}/pages/{page_id}", response_model=PageDetail)
async def get_page_detail(scan_id: uuid.UUID, page_id: uuid.UUID) -> PageDetail:
    """A page's screenshots (with capture geometry) + its full issue list — the
    data behind the inspector overlay."""
    async with async_session() as session:
        page = await session.get(Page, page_id)
        if page is None or page.scan_id != scan_id:
            raise HTTPException(404, "Page not found")
        issues = (await session.execute(
            select(Issue).where(Issue.page_id == page_id).order_by(Issue.category, Issue.rule_id)
        )).scalars().all()

    return page_detail_from_rows(page, list(issues))


@router.get("/{scan_id}/checks", response_model=list[CheckScoreOut])
async def get_scan_checks(scan_id: uuid.UUID) -> list[CheckScoreOut]:
    async with async_session() as session:
        result = await session.execute(
            select(CheckScoreRow)
            .where(CheckScoreRow.scan_id == scan_id)
            .order_by(CheckScoreRow.penalty.desc())
        )
        return [CheckScoreOut.model_validate(c) for c in result.scalars()]


@router.get("/{scan_id}/tree", response_model=ScanTree)
async def get_scan_tree(scan_id: uuid.UUID) -> ScanTree:
    """The Accessibility → WCAG version → level → criterion score tree."""
    async with async_session() as session:
        scan = await session.get(Scan, scan_id)
        if scan is None:
            raise HTTPException(404, "Scan not found")
        checks = (await session.execute(
            select(CheckScoreRow).where(CheckScoreRow.scan_id == scan_id)
        )).scalars().all()

    # Group criteria under version → level.
    by_version: dict[str, dict[str, list[CheckScoreRow]]] = defaultdict(lambda: defaultdict(list))
    for c in checks:
        version = c.wcag_version or "best-practice"
        level = c.wcag_level or "—"
        by_version[version][level].append(c)

    wcag = scan.wcag_scores or {}
    # Per-version node scores: 100 minus the raw penalties of that version's checks.
    version_penalty: dict[str, float] = defaultdict(float)
    for c in checks:
        if c.wcag_version:
            version_penalty[c.wcag_version] += c.penalty
    version_score = {v: max(0, round(100 - p)) for v, p in version_penalty.items()}

    version_nodes: list[CategoryNode] = []
    for version in sorted(by_version):
        level_nodes: list[CategoryNode] = []
        for level in sorted(by_version[version]):
            crit_nodes = [
                CategoryNode(
                    key=c.criterion_id or c.rule_id,
                    label=(f"{c.criterion_id} {c.criterion_name}" if c.criterion_id else c.rule_id),
                    score=c.check_score,
                )
                for c in sorted(by_version[version][level], key=lambda c: c.penalty, reverse=True)
            ]
            level_nodes.append(CategoryNode(key=f"{version}-{level}", label=f"Level {level}", children=crit_nodes))
        version_nodes.append(CategoryNode(
            key=version,
            label=(f"WCAG {version}" if version != "best-practice" else "Best practice"),
            score=version_score.get(version),
            children=level_nodes,
        ))

    accessibility = CategoryNode(
        key="accessibility", label="Accessibility",
        score=scan.accessibility_score, children=version_nodes,
    )
    return ScanTree(
        scan_id=scan.id,
        overall_score=scan.overall_score,
        overall_band=scan.overall_band,
        wcag_scores=wcag,
        categories=[accessibility],
    )


@router.get("/{scan_id}/issues", response_model=list[IssueGroup])
async def get_scan_issues(
    scan_id: uuid.UUID, include_manual: bool = True, category: str | None = None
) -> list[IssueGroup]:
    async with async_session() as session:
        query = (
            select(Issue, Page.url)
            .join(Page, Issue.page_id == Page.id)
            .where(Issue.scan_id == scan_id)
        )
        if not include_manual:
            query = query.where(Issue.manual_review.is_(False))
        if category:
            query = query.where(Issue.category == category)
        rows = (await session.execute(query)).all()

    grouped: dict[str, list] = defaultdict(list)
    for issue, page_url in rows:
        grouped[issue.rule_id].append((issue, page_url))

    issues: list[IssueGroup] = []
    for rule_id, entries in grouped.items():
        first = entries[0][0]
        page_urls = {url for _, url in entries}
        issues.append(IssueGroup(
            rule_id=rule_id,
            category=first.category,
            subcategory=first.subcategory,
            criterion_id=first.criterion_id,
            criterion_name=first.criterion_name,
            wcag_version=first.wcag_version,
            wcag_level=first.wcag_level,
            is_best_practice=first.is_best_practice,
            manual_review=first.manual_review,
            impact=first.impact,
            description=first.description,
            remediation=first.remediation,
            reference_url=first.reference_url,
            affected_page_count=len(page_urls),
            total_instances=len(entries),
            instances=[
                IssueInstance(
                    issue_id=iss.id,
                    page_url=url, selector=iss.selector, html_snippet=iss.html_snippet,
                    bbox=iss.bbox, viewport=iss.viewport,
                )
                for iss, url in entries[:25]
            ],
        ))

    severity_rank = {"critical": 0, "serious": 1, "moderate": 2, "minor": 3, None: 4}
    issues.sort(key=lambda i: (i.manual_review, severity_rank.get(i.impact, 4), -i.affected_page_count))
    return issues


@router.get("/{scan_id}/artifact")
async def get_artifact(scan_id: uuid.UUID, ref: str) -> FileResponse:
    """Serve a stored screenshot / DOM snapshot by its relative ref."""
    # Guard against path traversal: ref must stay under this scan's directory.
    if ".." in ref or not ref.startswith(f"{scan_id}/"):
        raise HTTPException(400, "Invalid artifact ref")
    path = resolve_ref(ref)
    if not path.exists():
        raise HTTPException(404, "Artifact not found")
    return FileResponse(path)
