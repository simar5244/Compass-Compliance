"""Admin-only user & assignment management. All routes require role=admin."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import func, select

from app.auth.deps import require_admin
from app.auth.security import hash_password
from app.config import settings
from app.db import async_session
from app.models import Scan, Site, SiteAssignment, User

router = APIRouter(prefix="/admin", tags=["admin"])


class CreateUserRequest(BaseModel):
    email: str
    name: str = ""
    password: str
    role: str = "user"


class SetRoleRequest(BaseModel):
    role: str  # admin | user


class ResetPasswordRequest(BaseModel):
    new_password: str


class AssignRequest(BaseModel):
    site_id: uuid.UUID


def _user_dict(u: User, site_ids: list[str]) -> dict:
    return {"id": str(u.id), "email": u.email, "name": u.name, "role": u.role,
            "assigned_site_ids": site_ids}


@router.get("/users")
async def list_users(_: User = Depends(require_admin)) -> dict:
    async with async_session() as session:
        users = (await session.execute(select(User).order_by(User.email))).scalars().all()
        assigns = (await session.execute(select(SiteAssignment))).scalars().all()
    by_user: dict[uuid.UUID, list[str]] = {}
    for a in assigns:
        by_user.setdefault(a.user_id, []).append(str(a.site_id))
    return {"users": [_user_dict(u, by_user.get(u.id, [])) for u in users]}


@router.post("/users")
async def create_user(payload: CreateUserRequest, _: User = Depends(require_admin)) -> dict:
    if payload.role not in ("admin", "user"):
        raise HTTPException(400, "role must be admin or user")
    async with async_session() as session:
        exists = (await session.execute(
            select(func.count(User.id)).where(User.email == payload.email.lower())
        )).scalar()
        if exists:
            raise HTTPException(409, "A user with that email already exists")
        user = User(email=str(payload.email).lower(), name=payload.name,
                    password_hash=hash_password(payload.password), role=payload.role)
        session.add(user)
        await session.commit()
        return _user_dict(user, [])


@router.patch("/users/{user_id}/role")
async def set_role(user_id: uuid.UUID, payload: SetRoleRequest, admin: User = Depends(require_admin)) -> dict:
    if payload.role not in ("admin", "user"):
        raise HTTPException(400, "role must be admin or user")
    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None:
            raise HTTPException(404, "User not found")
        user.role = payload.role
        await session.commit()
    return {"ok": True}


@router.post("/users/{user_id}/reset-password")
async def reset_password(user_id: uuid.UUID, payload: ResetPasswordRequest, _: User = Depends(require_admin)) -> dict:
    if len(payload.new_password) < 6:
        raise HTTPException(400, "Password must be at least 6 characters")
    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None:
            raise HTTPException(404, "User not found")
        user.password_hash = hash_password(payload.new_password)
        await session.commit()
    return {"ok": True}


@router.delete("/users/{user_id}")
async def delete_user(user_id: uuid.UUID, admin: User = Depends(require_admin)) -> dict:
    if user_id == admin.id:
        raise HTTPException(400, "You cannot delete your own account")
    async with async_session() as session:
        user = await session.get(User, user_id)
        if user is None:
            raise HTTPException(404, "User not found")
        await session.delete(user)
        await session.commit()
    return {"ok": True}


@router.post("/users/{user_id}/assignments")
async def assign_site(user_id: uuid.UUID, payload: AssignRequest, _: User = Depends(require_admin)) -> dict:
    async with async_session() as session:
        if await session.get(User, user_id) is None:
            raise HTTPException(404, "User not found")
        if await session.get(Site, payload.site_id) is None:
            raise HTTPException(404, "Site not found")
        exists = (await session.execute(
            select(SiteAssignment).where(
                SiteAssignment.user_id == user_id, SiteAssignment.site_id == payload.site_id)
        )).scalars().first()
        if not exists:
            session.add(SiteAssignment(user_id=user_id, site_id=payload.site_id))
            await session.commit()
    return {"ok": True}


@router.delete("/users/{user_id}/assignments/{site_id}")
async def unassign_site(user_id: uuid.UUID, site_id: uuid.UUID, _: User = Depends(require_admin)) -> dict:
    async with async_session() as session:
        row = (await session.execute(
            select(SiteAssignment).where(
                SiteAssignment.user_id == user_id, SiteAssignment.site_id == site_id)
        )).scalars().first()
        if row:
            await session.delete(row)
            await session.commit()
    return {"ok": True}


@router.post("/sites")
async def create_site(payload: dict, request: Request, _: User = Depends(require_admin)) -> dict:
    root_url = (payload.get("root_url") or "").strip()
    if not root_url:
        raise HTTPException(400, "root_url is required")
    if not root_url.startswith(("http://", "https://")):
        root_url = "https://" + root_url
    async with async_session() as session:
        exists = (await session.execute(
            select(Site).where(Site.root_url == root_url)
        )).scalars().first()
        if exists:
            raise HTTPException(409, "A site with that root URL already exists")
        site = Site(
            root_url=root_url, name=payload.get("name") or root_url,
            recrawl_interval_days=int(payload.get("recrawl_interval_days", 5)),
            max_pages=int(payload.get("max_pages", 400)),
            max_depth=int(payload.get("max_depth", 4)),
        )
        session.add(site)
        await session.flush()
        site_id = site.id
        # Kick off an initial crawl so the new site is monitored right away.
        scan = Scan(
            root_url=site.root_url, site_id=site_id, trigger="manual",
            max_pages=site.max_pages, max_depth=site.max_depth,
            render_pool_size=settings.render_pool_size,
        )
        session.add(scan)
        await session.commit()
        scan_id = scan.id

    try:
        await request.app.state.arq_pool.enqueue_job("run_scan_job", str(scan_id))
    except Exception:
        pass  # site is created; scheduler will pick it up if the enqueue failed
    return {"id": str(site_id), "root_url": root_url, "name": payload.get("name") or root_url}
