"""Shared pytest setup.

Two things have to happen before anything imports ``app.db``, because that
module builds the engine at import time:

1. ``WCT_TEST`` selects NullPool, so asyncpg connections are never reused across
   the per-test event loops pytest-asyncio creates (which otherwise raises
   "attached to a different loop").
2. ``DATABASE_URL`` is redirected to a dedicated test database. These tests
   create and delete users, sites and scans; pointed at the development database
   they mutate real data, and they fail outright when its port differs from the
   configured default. The test database is derived from whatever the app is
   configured to use (same server, ``_test`` suffix) so there is one source of
   truth for host/port/credentials, and it is created on demand if missing.

Override the whole URL with ``TEST_DATABASE_URL`` to point tests elsewhere.
"""

import asyncio
import os

os.environ.setdefault("WCT_TEST", "1")


def _resolve_test_database_url() -> str:
    explicit = os.getenv("TEST_DATABASE_URL")
    if explicit:
        return explicit

    from app.config import Settings

    # Read the app's configured URL without importing app.db.
    base = Settings().database_url
    from sqlalchemy.engine import make_url

    url = make_url(base)
    name = url.database or "wcag_scanner"
    if not name.endswith("_test"):
        url = url.set(database=f"{name}_test")
    return url.render_as_string(hide_password=False)


_TEST_DB_URL = _resolve_test_database_url()
os.environ["DATABASE_URL"] = _TEST_DB_URL

# app.config builds its ``settings`` singleton at import time, and resolving the
# URL above already imported it — so that instance still points at the developer
# database. Rebuild it from the patched environment before anything imports
# app.db, which binds its engine to whatever ``settings`` says at import time.
# Without this the redirect silently does nothing and the suite runs against
# real data.
import app.config  # noqa: E402

app.config.settings = app.config.Settings()
assert app.config.settings.database_url == _TEST_DB_URL, (
    "test database redirect failed; refusing to run against "
    f"{app.config.settings.database_url}"
)


async def _ensure_database_exists() -> None:
    """CREATE DATABASE if the test database is not there yet."""
    from sqlalchemy.engine import make_url
    from sqlalchemy.ext.asyncio import create_async_engine

    url = make_url(_TEST_DB_URL)
    target = url.database
    # Connect to the server's default database to issue CREATE DATABASE.
    admin = create_async_engine(
        url.set(database="postgres").render_as_string(hide_password=False),
        isolation_level="AUTOCOMMIT",
    )
    try:
        from sqlalchemy import text

        async with admin.connect() as conn:
            exists = (await conn.execute(
                text("SELECT 1 FROM pg_database WHERE datname = :n"), {"n": target}
            )).scalar()
            if not exists:
                await conn.execute(text(f'CREATE DATABASE "{target}"'))
    finally:
        await admin.dispose()


def pytest_sessionstart(session) -> None:
    """Create the test database and its schema once per run."""
    if not _TEST_DB_URL.startswith("postgresql"):
        return
    try:
        asyncio.run(_ensure_database_exists())
    except Exception as exc:  # surfaced by the first test that needs the DB
        print(f"[conftest] could not prepare test database: {exc}")
        return

    # Import the models first: create_all only builds tables that are registered
    # on Base.metadata, and an empty metadata leaves init_db's ALTERs with
    # nothing to alter.
    import app.models  # noqa: F401
    from app.db import init_db

    asyncio.run(init_db())
