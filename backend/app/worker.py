"""arq worker: runs scan jobs off the request/response cycle."""

from __future__ import annotations

import logging

from arq import cron
from arq.connections import RedisSettings

from app.config import settings
from app.db import init_db
from app.retest import run_retest
from app.scan_engine import reclaim_stalled_scans, run_scan
from app.scheduler import recrawl_due_sites
from app.seed import seed_initial_data

logging.basicConfig(level=logging.INFO)


async def run_scan_job(ctx: dict, scan_id: str) -> None:
    await run_scan(scan_id)


async def run_retest_job(ctx: dict, job_id: str) -> None:
    await run_retest(job_id)


async def scheduled_recrawls(ctx: dict) -> int:
    return await recrawl_due_sites(ctx)


async def reclaim_stalled(ctx: dict) -> int:
    """Release scans whose worker died mid-run so they stop showing as running."""
    return await reclaim_stalled_scans()


async def on_startup(ctx: dict) -> None:
    await init_db()
    await seed_initial_data()
    # A worker restart is the usual reason a scan is abandoned, so sweep once on
    # the way up as well as on the schedule below.
    await reclaim_stalled_scans()


class WorkerSettings:
    functions = [run_scan_job, run_retest_job]
    cron_jobs = [
        # Check once daily; each site applies its own interval in days.
        cron(scheduled_recrawls, hour=0, minute=7),
        # Catches a job killed while the worker itself keeps running (arq's
        # job_timeout), which no restart would otherwise clean up.
        cron(reclaim_stalled, minute={5, 20, 35, 50}),
    ]
    on_startup = on_startup
    redis_settings = RedisSettings.from_dsn(settings.redis_url)
    job_timeout = 60 * 30  # 30 minutes ceiling for a full site scan
    # Run several jobs at once so an instant retest executes CONCURRENTLY with a
    # long-running crawl instead of waiting in line behind it.
    max_jobs = 6
