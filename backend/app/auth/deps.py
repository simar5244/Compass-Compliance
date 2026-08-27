"""FastAPI dependencies for authentication and authorization.

`get_current_user` resolves the httpOnly session cookie to a live User (401 if
missing/expired). `require_admin` gates admin-only routes. `assigned_site_ids`
returns the set of sites a user may see — admins see all — and is used to scope
every site query at the DB level, never just in the UI.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from fastapi import Depends, HTTPException, Request
from sqlalchemy import select

from app.auth.security import SESSION_COOKIE, hash_session_token
from app.db import async_session
from app.models import Session, Site, SiteAssignment, User


async def get_current_user(request: Request) -> User:
    token = request.cookies.get(SESSION_COOKIE)
    if not token:
        raise HTTPException(401, "Not authenticated")
    token_hash = hash_session_token(token)
    async with async_session() as session:
        row = (await session.execute(
            select(Session).where(Session.token_hash == token_hash)
        )).scalars().first()
        if row is None or row.expires_at <= datetime.now(timezone.utc):
            raise HTTPException(401, "Session expired")
        user = await session.get(User, row.user_id)
        if user is None:
            raise HTTPException(401, "User not found")
        return user


async def require_admin(user: User = Depends(get_current_user)) -> User:
    if user.role != "admin":
        raise HTTPException(403, "Admin access required")
    return user


async def assigned_site_ids(user: User) -> set[uuid.UUID] | None:
    """Site ids the user may access. None means 'all sites' (admin)."""
    if user.role == "admin":
        return None
    async with async_session() as session:
        rows = (await session.execute(
            select(SiteAssignment.site_id).where(SiteAssignment.user_id == user.id)
        )).scalars().all()
        return set(rows)


async def authorize_site(site_id: uuid.UUID, user: User) -> Site:
    """Return the site if the user may access it, else 404 (never leak existence)."""
    allowed = await assigned_site_ids(user)
    if allowed is not None and site_id not in allowed:
        raise HTTPException(404, "Site not found")
    async with async_session() as session:
        site = await session.get(Site, site_id)
    if site is None:
        raise HTTPException(404, "Site not found")
    return site
