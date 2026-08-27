"""Assignment enforcement: a user can only reach sites assigned to them; admins
see all. Exercises the real scoping layer (auth.deps) against the DB.
"""

import uuid

import pytest
from fastapi import HTTPException
from sqlalchemy import delete

from app.auth.deps import assigned_site_ids, authorize_site
from app.auth.security import hash_password
from app.db import async_session
from app.models import Site, SiteAssignment, User


@pytest.fixture
async def two_users_two_sites():
    tag = uuid.uuid4().hex[:8]
    async with async_session() as s:
        ua = User(email=f"a-{tag}@t", name="A", password_hash=hash_password("x"), role="user")
        ub = User(email=f"b-{tag}@t", name="B", password_hash=hash_password("x"), role="user")
        admin = User(email=f"adm-{tag}@t", name="Adm", password_hash=hash_password("x"), role="admin")
        sa = Site(root_url=f"https://a-{tag}.test/", name="Site A")
        sb = Site(root_url=f"https://b-{tag}.test/", name="Site B")
        s.add_all([ua, ub, admin, sa, sb])
        await s.flush()
        s.add(SiteAssignment(user_id=ua.id, site_id=sa.id))
        s.add(SiteAssignment(user_id=ub.id, site_id=sb.id))
        await s.commit()
        ids = (ua.id, ub.id, admin.id, sa.id, sb.id)
    yield ids
    async with async_session() as s:
        await s.execute(delete(SiteAssignment).where(SiteAssignment.site_id.in_([ids[3], ids[4]])))
        await s.execute(delete(Site).where(Site.id.in_([ids[3], ids[4]])))
        await s.execute(delete(User).where(User.id.in_([ids[0], ids[1], ids[2]])))
        await s.commit()


async def test_user_sees_only_assigned_site(two_users_two_sites):
    ua_id, ub_id, admin_id, sa_id, sb_id = two_users_two_sites
    async with async_session() as s:
        ua = await s.get(User, ua_id)
    assert await assigned_site_ids(ua) == {sa_id}


async def test_admin_sees_all_sites(two_users_two_sites):
    _, _, admin_id, _, _ = two_users_two_sites
    async with async_session() as s:
        admin = await s.get(User, admin_id)
    assert await assigned_site_ids(admin) is None  # None == all


async def test_user_cannot_authorize_other_users_site(two_users_two_sites):
    ua_id, _, _, _, sb_id = two_users_two_sites
    async with async_session() as s:
        ua = await s.get(User, ua_id)
    # user A reaching site B (assigned to B) must 404, not leak.
    with pytest.raises(HTTPException) as exc:
        await authorize_site(sb_id, ua)
    assert exc.value.status_code == 404


async def test_user_can_authorize_own_site(two_users_two_sites):
    ua_id, _, _, sa_id, _ = two_users_two_sites
    async with async_session() as s:
        ua = await s.get(User, ua_id)
    site = await authorize_site(sa_id, ua)
    assert site.id == sa_id


async def test_admin_can_authorize_any_site(two_users_two_sites):
    _, _, admin_id, _, sb_id = two_users_two_sites
    async with async_session() as s:
        admin = await s.get(User, admin_id)
    site = await authorize_site(sb_id, admin)
    assert site.id == sb_id
