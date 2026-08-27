"""Scheduled recrawls.

An arq cron job wakes periodically, finds sites whose last successful scan is
older than their `recrawl_interval_days`, and enqueues a crawl for each — at
NORMAL priority, so instant scans and retests keep their headroom. The same
per-site concurrency guard used by "Scan now" applies: never two active crawls
of one site.
"""

from __future__ import annotations

import logging
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select

from app.config import settings
from app.db import async_session
from app.models import Scan, Site

logger = logging.getLogger("wcag_scanner.scheduler")


def is_site_due(site: Site, now: datetime) -> bool:
    """Return whether a site should be claimed by the daily scheduler."""
    if site.force_rescan:
        return True
    return site.last_scanned_at is None or (
        site.last_scanned_at + timedelta(days=max(1, site.recrawl_interval_days)) <= now
    )


async def _has_active_scan(session, site_id) -> bool:
    n = (await session.execute(
        select(func.count(Scan.id)).where(
            Scan.site_id == site_id, Scan.status.in_(["pending", "crawling", "scoring"])
        )
    )).scalar()
    return bool(n)


async def recrawl_due_sites(ctx: dict) -> int:
    """Enqueue crawls for sites due for a recrawl. Returns the number enqueued."""
    now = datetime.now(timezone.utc)
    enqueued = 0
    async with async_session() as session:
        sites = (await session.execute(select(Site))).scalars().all()
        for site in sites:
            if not is_site_due(site, now) or await _has_active_scan(session, site.id):
                continue
            scan = Scan(
                root_url=site.root_url, site_id=site.id, trigger="scheduled",
                max_pages=site.max_pages, max_depth=site.max_depth,
                render_pool_size=settings.render_pool_size, ignore_patterns=site.ignore_patterns or [],
            )
            session.add(scan)
            # force_rescan is deliberately one-shot. If enqueueing fails, the
            # existing scan remains queued for retry and the site is not swept
            # repeatedly on every scheduler tick.
            site.force_rescan = False
            await session.commit()
            await ctx["redis"].enqueue_job("run_scan_job", str(scan.id))
            enqueued += 1
            logger.info("Scheduled recrawl enqueued for site %s (%s)", site.id, site.root_url)
    return enqueued
