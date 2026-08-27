"""Per-site policy keyword rules (B24).

GET returns the site's effective rules (its own, or the built-in defaults so an
admin can edit from a baseline). POST replaces the site's rules (admin only).
Each rule is ``{id, label, patterns: [str]}``.
"""

from __future__ import annotations

import uuid

from fastapi import APIRouter, Depends, HTTPException

from app.audit.policy_checks import load_default_policy_rules
from app.auth.deps import authorize_site, get_current_user, require_admin
from app.db import async_session
from app.models import Site, User

router = APIRouter(prefix="/sites", tags=["policies"])


def _clean_rules(raw) -> list[dict]:
    if not isinstance(raw, list):
        raise HTTPException(400, "rules must be a list")
    out = []
    for r in raw:
        if not isinstance(r, dict):
            continue
        rid = str(r.get("id") or "").strip()
        patterns = [str(p).strip() for p in (r.get("patterns") or []) if str(p).strip()]
        if not rid or not patterns:
            continue
        out.append({"id": rid, "label": str(r.get("label") or rid), "patterns": patterns})
    if not out:
        raise HTTPException(400, "no valid rules provided (each needs id + non-empty patterns)")
    return out


@router.get("/{site_id}/policies")
async def get_policies(site_id: uuid.UUID, user: User = Depends(get_current_user)) -> dict:
    await authorize_site(site_id, user)
    async with async_session() as session:
        site = await session.get(Site, site_id)
        if site is None:
            raise HTTPException(404, "Site not found")
        rules = site.policy_rules or load_default_policy_rules()
        return {"rules": rules, "is_default": not bool(site.policy_rules)}


@router.post("/{site_id}/policies")
async def set_policies(site_id: uuid.UUID, payload: dict, user: User = Depends(require_admin)) -> dict:
    rules = _clean_rules(payload.get("rules"))
    async with async_session() as session:
        site = await session.get(Site, site_id)
        if site is None:
            raise HTTPException(404, "Site not found")
        site.policy_rules = rules
        await session.commit()
    return {"ok": True, "rules": rules}
