"""Idempotent seed: an initial admin, a demo viewer, and the default site.

Runs on startup. Safe to call repeatedly — it only creates what's missing.
Default credentials (dev): admin / admin  and  viewer / viewer.
"""

from __future__ import annotations

import logging

from sqlalchemy.exc import IntegrityError
from sqlalchemy import func, select

from app.auth.security import hash_password
from app.db import async_session
from app.models import Site, SiteAssignment, User

logger = logging.getLogger("wcag_scanner.seed")

DEFAULT_SITE_URL = "https://www.depts.ttu.edu/k12/"
DEFAULT_SITE_NAME = "TTU K-12"


async def seed_initial_data() -> None:
    """Idempotent, and safe to run concurrently.

    The API and the worker start at the same time and both call this. The
    check-then-insert below is a race: both can observe an empty table and both
    then insert, so one loses on the unique index. Losing that race is fine —
    the other process seeded the same rows — so the conflict is swallowed rather
    than crashing a container on every fresh deployment.
    """
    try:
        await _seed_once()
    except IntegrityError:
        logger.info("Seed data already created by another process; continuing.")


async def _seed_once() -> None:
    async with async_session() as session:
        user_count = (await session.execute(select(func.count(User.id)))).scalar()
        admin = viewer = None
        if user_count == 0:
            admin = User(email="admin", name="Administrator",
                         password_hash=hash_password("admin"), role="admin")
            viewer = User(email="viewer", name="Demo Viewer",
                          password_hash=hash_password("viewer"), role="user")
            session.add_all([admin, viewer])
            await session.flush()
            logger.info("Seeded admin/admin and viewer/viewer users")

        site = (await session.execute(
            select(Site).where(Site.root_url == DEFAULT_SITE_URL)
        )).scalars().first()
        if site is None:
            site = Site(root_url=DEFAULT_SITE_URL, name=DEFAULT_SITE_NAME,
                        recrawl_interval_days=5, max_pages=400, max_depth=4)
            session.add(site)
            await session.flush()
            logger.info("Seeded default site %s", DEFAULT_SITE_URL)

        # Assign the default site to the demo viewer so scoping is demoable.
        if viewer is not None:
            session.add(SiteAssignment(site_id=site.id, user_id=viewer.id))

        await session.commit()
