"""A worker killed mid-crawl leaves its scan running forever.

The row never reaches the finalize path, so the coverage guard there never sees
it and the dashboard shows a scan permanently in progress. These pin the
reclaim, and — more importantly — that it cannot touch a live scan.
"""

from datetime import datetime, timedelta, timezone

import pytest
from sqlalchemy import delete

from app.db import async_session
from app.models import Scan
from app.scan_engine import STALLED_SCAN_GRACE, reclaim_stalled_scans


async def _make_scan(status: str, last_progress_at, **kwargs) -> Scan:
    async with async_session() as session:
        scan = Scan(
            root_url="https://stalled.test/",
            status=status,
            last_progress_at=last_progress_at,
            **kwargs,
        )
        session.add(scan)
        await session.commit()
        await session.refresh(scan)
        return scan


async def _status_of(scan_id) -> str:
    async with async_session() as session:
        return (await session.get(Scan, scan_id)).status


@pytest.fixture(autouse=True)
async def _cleanup():
    yield
    async with async_session() as session:
        await session.execute(delete(Scan).where(Scan.root_url == "https://stalled.test/"))
        await session.commit()


async def test_abandoned_crawl_is_reclaimed():
    stale = datetime.now(timezone.utc) - STALLED_SCAN_GRACE - timedelta(minutes=1)
    scan = await _make_scan("crawling", stale)
    assert await reclaim_stalled_scans() >= 1
    assert await _status_of(scan.id) == "failed"


async def test_live_scan_is_left_alone():
    # The whole point: a scan that is still reporting progress must survive.
    scan = await _make_scan("crawling", datetime.now(timezone.utc))
    await reclaim_stalled_scans()
    assert await _status_of(scan.id) == "crawling"


async def test_recently_started_scan_is_left_alone():
    fresh = datetime.now(timezone.utc) - timedelta(minutes=2)
    scan = await _make_scan("crawling", fresh)
    await reclaim_stalled_scans()
    assert await _status_of(scan.id) == "crawling"


async def test_finished_scan_is_untouched():
    stale = datetime.now(timezone.utc) - STALLED_SCAN_GRACE - timedelta(hours=2)
    scan = await _make_scan("done", stale)
    await reclaim_stalled_scans()
    assert await _status_of(scan.id) == "done"


async def test_scan_with_no_heartbeat_falls_back_to_creation_time():
    # A scan that died before its first heartbeat still has to be recoverable.
    scan = await _make_scan("pending", None)
    async with async_session() as session:
        row = await session.get(Scan, scan.id)
        row.created_at = datetime.now(timezone.utc) - STALLED_SCAN_GRACE - timedelta(minutes=5)
        await session.commit()
    await reclaim_stalled_scans()
    assert await _status_of(scan.id) == "failed"
