import os

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.pool import NullPool

from app.config import settings

# Under pytest (WCT_TEST=1) use NullPool so no asyncpg connection is reused
# across the per-test event loops pytest-asyncio creates. In normal operation we
# keep the pooled engine with pre-ping.
_engine_kwargs = {"poolclass": NullPool} if os.getenv("WCT_TEST") else {"pool_pre_ping": True}
engine = create_async_engine(settings.database_url, **_engine_kwargs)
async_session = async_sessionmaker(engine, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_session() -> AsyncSession:
    async with async_session() as session:
        yield session


async def init_db() -> None:
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

        # Lightweight, no-Alembic schema safety net.
        # We use SQLAlchemy's `create_all` for initial table creation, but it does
        # not add new columns to existing tables. A few evolving fields are safe
        # to backfill with defaults.
        if engine.url.get_backend_name().startswith("postgresql"):
            # Added in newer versions of the app; older local DBs may not have it.
            await conn.execute(
                text(
                    "ALTER TABLE scans ADD COLUMN IF NOT EXISTS metrics JSON NOT NULL DEFAULT '{}'::json"
                )
            )

            # Heartbeat for reclaiming scans abandoned by a killed worker.
            await conn.execute(
                text(
                    "ALTER TABLE scans ADD COLUMN IF NOT EXISTS last_progress_at TIMESTAMPTZ"
                )
            )

            # Content metrics added later; keep older local DBs compatible.
            await conn.execute(
                text(
                    "ALTER TABLE pages ADD COLUMN IF NOT EXISTS word_count INTEGER"
                )
            )
            await conn.execute(
                text(
                    "ALTER TABLE pages ADD COLUMN IF NOT EXISTS sentence_count INTEGER"
                )
            )
            await conn.execute(
                text(
                    "ALTER TABLE pages ADD COLUMN IF NOT EXISTS reading_age DOUBLE PRECISION"
                )
            )

            # Grammar approve/ignore flags; older local DBs predate these columns.
            await conn.execute(
                text(
                    "ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_approved BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )
            await conn.execute(
                text(
                    "ALTER TABLE issues ADD COLUMN IF NOT EXISTS is_ignored BOOLEAN NOT NULL DEFAULT FALSE"
                )
            )

            # Per-site policy keyword rules (B24); older local DBs predate it.
            await conn.execute(
                text("ALTER TABLE sites ADD COLUMN IF NOT EXISTS policy_rules JSON")
            )
            # Per-site forced-include / removed page URLs; older local DBs predate them.
            await conn.execute(
                text("ALTER TABLE sites ADD COLUMN IF NOT EXISTS included_page_urls JSON")
            )
            await conn.execute(
                text("ALTER TABLE sites ADD COLUMN IF NOT EXISTS removed_page_urls JSON")
            )
            await conn.execute(
                text("ALTER TABLE sites ADD COLUMN IF NOT EXISTS force_rescan BOOLEAN NOT NULL DEFAULT FALSE")
            )
            # PDF/document rows in the pages table (Group D); older DBs predate it.
            await conn.execute(
                text("ALTER TABLE pages ADD COLUMN IF NOT EXISTS is_document BOOLEAN NOT NULL DEFAULT FALSE")
            )
