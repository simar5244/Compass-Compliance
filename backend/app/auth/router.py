"""Auth endpoints: login (sets session cookie), logout, me, change-password."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Request, Response
from pydantic import BaseModel
from sqlalchemy import delete, select

from app.auth.deps import get_current_user
from app.auth.security import (
    SESSION_COOKIE,
    SESSION_COOKIE_PATH,
    SESSION_COOKIE_SECURE,
    SESSION_TTL_DAYS,
    hash_password,
    hash_session_token,
    new_session_token,
    verify_password,
)
from app.db import async_session
from app.models import Session, User

router = APIRouter(prefix="/auth", tags=["auth"])


class LoginRequest(BaseModel):
    email: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class UserOut(BaseModel):
    id: str
    email: str
    name: str
    role: str


def _user_out(u: User) -> UserOut:
    return UserOut(id=str(u.id), email=u.email, name=u.name, role=u.role)


@router.post("/login", response_model=UserOut)
async def login(payload: LoginRequest, response: Response) -> UserOut:
    async with async_session() as session:
        user = (await session.execute(
            select(User).where(User.email == payload.email.strip().lower())
        )).scalars().first()
        # Constant-ish work whether or not the user exists (verify runs either way).
        ok = user is not None and verify_password(payload.password, user.password_hash)
        if not ok:
            raise HTTPException(401, "Invalid email or password")

        token = new_session_token()
        session.add(Session(
            user_id=user.id, token_hash=hash_session_token(token),
            expires_at=datetime.now(timezone.utc) + timedelta(days=SESSION_TTL_DAYS),
        ))
        await session.commit()
        out = _user_out(user)

    response.set_cookie(
        SESSION_COOKIE, token, httponly=True, samesite="lax",
        max_age=SESSION_TTL_DAYS * 24 * 3600, path=SESSION_COOKIE_PATH,
        secure=SESSION_COOKIE_SECURE,
    )
    return out


@router.post("/logout")
async def logout(request: Request, response: Response) -> dict:
    """Revoke the current session server-side and clear the cookie."""
    token = request.cookies.get(SESSION_COOKIE)
    if token:
        async with async_session() as session:
            await session.execute(delete(Session).where(Session.token_hash == hash_session_token(token)))
            await session.commit()
    response.delete_cookie(SESSION_COOKIE, path=SESSION_COOKIE_PATH)
    return {"ok": True}


@router.get("/me", response_model=UserOut)
async def me(user: User = Depends(get_current_user)) -> UserOut:
    return _user_out(user)


@router.post("/change-password")
async def change_password(
    payload: ChangePasswordRequest, request: Request, user: User = Depends(get_current_user)
) -> dict:
    if len(payload.new_password) < 6:
        raise HTTPException(400, "New password must be at least 6 characters")
    current_token = request.cookies.get(SESSION_COOKIE)
    async with async_session() as session:
        db_user = await session.get(User, user.id)
        if not verify_password(payload.current_password, db_user.password_hash):
            raise HTTPException(400, "Current password is incorrect")
        db_user.password_hash = hash_password(payload.new_password)
        # Invalidate every OTHER session; keep the caller's current one alive.
        if current_token:
            await session.execute(delete(Session).where(
                Session.user_id == user.id,
                Session.token_hash != hash_session_token(current_token),
            ))
        await session.commit()
    return {"ok": True}
