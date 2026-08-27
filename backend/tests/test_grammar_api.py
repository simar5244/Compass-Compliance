"""Grammar API: /checks/grammar/issues (grouped), /approve, /ignore-rule.

Exercises the real endpoint handlers against the DB with an admin user (admins
authorize any site). Grammar findings live as Issue rows whose html_snippet holds
the JSON payload the engine emits.
"""

import json
import uuid

import pytest
from sqlalchemy import delete, select

from app.api.sites import approve_grammar, ignore_grammar_rule, list_grammar_issues
from app.auth.security import hash_password
from app.db import async_session
from app.models import (
    ApprovedGrammar,
    IgnoredGrammarRule,
    Issue,
    Page,
    Scan,
    Site,
    User,
)


def _payload(rule_id, error_text, group, severity, source="visible"):
    return json.dumps({
        "rule_id": rule_id, "rule_message": "msg", "silktide_group": group,
        "severity": severity, "excerpt": f"...{error_text}...",
        "corrected_excerpt": f"...fixed...", "error_text": error_text,
        "replacement": "fixed", "source_type": source, "lang_code": "en-US",
    })


def _issue(scan_id, page_id, rule_id, error_text, group, severity, source="visible"):
    return Issue(
        scan_id=scan_id, page_id=page_id, rule_id="grammar", category="content",
        subcategory="Grammar", impact="moderate" if severity == "error" else "minor",
        description=group, html_snippet=_payload(rule_id, error_text, group, severity, source),
    )


@pytest.fixture
async def grammar_site():
    """Admin + site + done scan with a spread of grammar issues:
      - 'will will'  (Word repetition / error) x2 pages
      - 'teh'        (Word repetition / error) x1
      - 'a apple'    (a-vs-an / warning)       x1
    """
    tag = uuid.uuid4().hex[:8]
    async with async_session() as s:
        admin = User(email=f"adm-{tag}@t", name="Adm", password_hash=hash_password("x"), role="admin")
        site = Site(root_url=f"https://g-{tag}.test/", name="G")
        s.add_all([admin, site])
        await s.flush()
        scan = Scan(root_url=site.root_url, site_id=site.id, status="done")
        s.add(scan)
        await s.flush()
        p1 = Page(scan_id=scan.id, url=f"https://g-{tag}.test/a",
                  normalized_url=f"https://g-{tag}.test/a", depth=0)
        p2 = Page(scan_id=scan.id, url=f"https://g-{tag}.test/b",
                  normalized_url=f"https://g-{tag}.test/b", depth=1)
        s.add_all([p1, p2])
        await s.flush()
        s.add_all([
            _issue(scan.id, p1.id, "ENGLISH_WORD_REPEAT_RULE", "will will", "Word repetition", "error"),
            _issue(scan.id, p2.id, "ENGLISH_WORD_REPEAT_RULE", "will will", "Word repetition", "error"),
            _issue(scan.id, p1.id, "ENGLISH_WORD_REPEAT_RULE", "teh", "Word repetition", "error"),
            _issue(scan.id, p2.id, "EN_A_VS_AN", "a apple", "Use of 'a' vs. 'an'", "warning", "title"),
        ])
        await s.commit()
        ids = (admin.id, site.id, scan.id)
    yield ids
    async with async_session() as s:
        await s.execute(delete(ApprovedGrammar).where(ApprovedGrammar.site_id == ids[1]))
        await s.execute(delete(IgnoredGrammarRule).where(IgnoredGrammarRule.site_id == ids[1]))
        await s.execute(delete(Issue).where(Issue.scan_id == ids[2]))
        await s.execute(delete(Page).where(Page.scan_id == ids[2]))
        await s.execute(delete(Scan).where(Scan.id == ids[2]))
        await s.execute(delete(Site).where(Site.id == ids[1]))
        await s.execute(delete(User).where(User.id == ids[0]))
        await s.commit()


async def _user(uid):
    async with async_session() as s:
        return await s.get(User, uid)


async def test_issues_grouped_errors_first_and_aggregated(grammar_site):
    admin_id, site_id, _ = grammar_site
    out = await list_grammar_issues(site_id, await _user(admin_id))

    # 3 distinct (rule_id, error_text) rows -> total 3; 4 raw instances.
    assert out["total_issue_count"] == 3
    assert out["lang_codes_detected"] == ["en-US"]

    names = [g["group_name"] for g in out["groups"]]
    assert names[0] == "Word repetition"                 # error group first
    assert "Use of 'a' vs. 'an'" in names                # warning group present
    assert out["groups"][0]["severity"] == "error"
    assert out["groups"][-1]["severity"] == "warning"

    wr = out["groups"][0]
    # 'will will' (2) before 'teh' (1) within the group
    assert [i["error_text"] for i in wr["issues"]] == ["will will", "teh"]
    assert wr["issues"][0]["quantity"] == 2
    assert wr["rule_ids"] == ["ENGLISH_WORD_REPEAT_RULE"]

    # source_type carried through for the title finding
    a_vs_an = [g for g in out["groups"] if g["group_name"] == "Use of 'a' vs. 'an'"][0]
    assert a_vs_an["issues"][0]["source_type"] == "title"
    assert a_vs_an["issues"][0]["corrected_excerpt"] is not None


async def test_approve_removes_all_matching_and_persists(grammar_site):
    admin_id, site_id, _ = grammar_site
    user = await _user(admin_id)

    res = await approve_grammar(site_id, {"error_text": "will will"}, user)
    assert res["ok"] and res["approved_text"] == "will will"
    assert res["updated"] == 2                            # both pages flagged

    # row recorded site-wide
    async with async_session() as s:
        row = (await s.execute(
            select(ApprovedGrammar).where(ApprovedGrammar.site_id == site_id)
        )).scalars().first()
        assert row is not None and row.error_text == "will will"

    # 'will will' no longer surfaces; 'teh' + 'a apple' remain (total 2)
    out = await list_grammar_issues(site_id, user)
    assert out["total_issue_count"] == 2
    texts = [i["error_text"] for g in out["groups"] for i in g["issues"]]
    assert "will will" not in texts and "teh" in texts and "a apple" in texts


async def test_approve_requires_error_text(grammar_site):
    admin_id, site_id, _ = grammar_site
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await approve_grammar(site_id, {"error_text": "   "}, await _user(admin_id))
    assert exc.value.status_code == 400


async def test_ignore_rule_excludes_whole_rule(grammar_site):
    admin_id, site_id, _ = grammar_site
    user = await _user(admin_id)

    res = await ignore_grammar_rule(site_id, {"rule_id": "ENGLISH_WORD_REPEAT_RULE"}, user)
    assert res["ok"] and res["rule_id"] == "ENGLISH_WORD_REPEAT_RULE"
    assert res["updated"] == 3                            # will will x2 + teh

    async with async_session() as s:
        row = (await s.execute(
            select(IgnoredGrammarRule).where(IgnoredGrammarRule.site_id == site_id)
        )).scalars().first()
        assert row is not None and row.rule_id == "ENGLISH_WORD_REPEAT_RULE"

    # only the a-vs-an warning remains
    out = await list_grammar_issues(site_id, user)
    assert out["total_issue_count"] == 1
    assert out["groups"][0]["group_name"] == "Use of 'a' vs. 'an'"


async def test_ignore_rule_requires_rule_id(grammar_site):
    admin_id, site_id, _ = grammar_site
    from fastapi import HTTPException
    with pytest.raises(HTTPException) as exc:
        await ignore_grammar_rule(site_id, {}, await _user(admin_id))
    assert exc.value.status_code == 400


async def test_issues_empty_when_no_scan(grammar_site):
    """A site with no completed scan returns an empty, well-formed payload."""
    admin_id, _, _ = grammar_site
    async with async_session() as s:
        admin = await s.get(User, admin_id)
        empty_site = Site(root_url=f"https://empty-{uuid.uuid4().hex[:6]}.test/", name="E")
        s.add(empty_site)
        await s.commit()
        empty_id = empty_site.id
    try:
        out = await list_grammar_issues(empty_id, admin)
        assert out == {"total_issue_count": 0, "lang_codes_detected": [], "groups": []}
    finally:
        async with async_session() as s:
            await s.execute(delete(Site).where(Site.id == empty_id))
            await s.commit()
