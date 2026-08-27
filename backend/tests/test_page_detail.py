from datetime import datetime, timezone
import uuid

from sqlalchemy import delete

from app.api.scans import get_page_detail
from app.db import async_session
from app.models import Issue, Page, Scan


async def test_page_detail_returns_page_scoped_category_scores() -> None:
    scan_id = uuid.uuid4()
    page_id = uuid.uuid4()
    scanned_at = datetime.now(timezone.utc)

    async with async_session() as session:
        session.add(Scan(id=scan_id, root_url="https://page-score.test", status="done"))
        session.add(Page(
            id=page_id,
            scan_id=scan_id,
            url="https://page-score.test/example",
            normalized_url="https://page-score.test/example",
            depth=0,
            title="Example page",
            render_status="ok",
            status_code=200,
            render_ms=4200,
            word_count=1240,
            reading_age=12.1,
            issue_count=2,
            manual_review_count=0,
            scanned_at=scanned_at,
        ))
        session.add_all([
            Issue(
                scan_id=scan_id,
                page_id=page_id,
                rule_id="color-contrast",
                category="accessibility",
                impact="serious",
                description="Text contrast is too low",
                remediation="Increase the contrast.",
                reference_url="https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html",
                wcag_version="2.0",
                wcag_level="AA",
                criterion_id="1.4.3",
            ),
            Issue(
                scan_id=scan_id,
                page_id=page_id,
                rule_id="broken-links",
                category="content",
                impact="moderate",
                description="A link is broken",
                remediation="Update or remove the link.",
                reference_url="",
            ),
        ])
        await session.commit()

    try:
        detail = await get_page_detail(scan_id, page_id)

        assert detail.category_scores["Accessibility"] < 100
        assert detail.category_scores["Content"] < 100
        assert detail.category_scores["Policies"] is None
        assert detail.category_scores["Inventory"] is None
        assert detail.word_count == 1240
        assert detail.reading_age == 12.1
        assert detail.render_time_ms == 4200
        assert detail.http_status == 200
        assert detail.last_scanned_at == scanned_at
        assert detail.issue_count_automated == 2
        assert detail.issue_count_manual == 0
    finally:
        async with async_session() as session:
            await session.execute(delete(Issue).where(Issue.scan_id == scan_id))
            await session.execute(delete(Page).where(Page.scan_id == scan_id))
            await session.execute(delete(Scan).where(Scan.id == scan_id))
            await session.commit()
