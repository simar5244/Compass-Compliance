"""Group B sub-batch 3 — policy keyword engine + inventory checks."""

import json

import pytest
from fastapi import HTTPException

from app.api.policies import _clean_rules
from app.audit.policy_checks import (
    check_forms_inventory,
    check_headings_review,
    check_network_requests_review,
    check_sensitive_keywords,
    _terms_present_in_text,
    load_default_policy_rules,
    resolve_sensitive_keyword_rules,
    run_policy_batch,
    run_policy_checks,
)
from app.render.response_context import NetworkRequest, ResponseContext

_RULES = [
    {"id": "find_accessibility", "label": 'Find "accessibility"', "patterns": ["accessibility"]},
    {"id": "sb17", "label": "Texas SB 17", "patterns": ["senate bill 17", "SB17"]},
]


def test_defaults_load():
    rules = load_default_policy_rules()
    assert isinstance(rules, list) and any(r["id"] == "find_accessibility" for r in rules)
    sensitive = next(rule for rule in rules if rule["id"] == "sensitive_keywords")
    assert sensitive["patterns"] == []


def test_sensitive_candidates_must_be_complete_terms_present_on_page():
    text = "Review this blacklist carefully. The item was already blacklisted."
    assert _terms_present_in_text(text, ["blacklist", "missing", "blacklist"]) == ["blacklist"]


@pytest.mark.asyncio
async def test_site_configured_sensitive_terms_are_used_without_discovery():
    rules = [{"id": "sensitive_keywords", "label": "Sensitive keywords", "patterns": ["review term", "absent"]}]
    resolved = await resolve_sensitive_keyword_rules("This page contains a review term.", rules)
    sensitive = next(rule for rule in resolved if rule["id"] == "sensitive_keywords")
    assert sensitive["patterns"] == ["review term"]


def test_policy_keyword_fires_case_insensitive_with_count():
    out = run_policy_checks("We value Accessibility. Accessibility matters.", _RULES)
    assert len(out) == 1 and out[0]["rule_id"] == "find_accessibility"
    assert out[0]["category"] == "policies" and out[0]["manual_review"] is True
    payload = json.loads(out[0]["html_snippet"])
    assert payload["match_count"] == 2 and payload["matched_text"] == ["accessibility"]


def test_policy_keyword_multiple_patterns_one_issue():
    out = run_policy_checks("Compliant with Senate Bill 17 and SB17.", _RULES)
    assert len(out) == 1 and out[0]["rule_id"] == "sb17"
    assert set(json.loads(out[0]["html_snippet"])["matched_text"]) == {"senate bill 17", "SB17"}


def test_policy_keyword_no_match():
    assert run_policy_checks("nothing relevant here", _RULES) == []


def test_forms_inventory_assisted():
    out = check_forms_inventory([{"action": "/apply", "method": "post", "field_count": 5}])
    assert out and out[0]["rule_id"] == "forms_inventory" and out[0]["manual_review"] is True
    assert check_forms_inventory([]) == []


def test_headings_review_assisted():
    out = check_headings_review([
        {"level": 1, "text": "Welcome", "selector": "#welcome", "html": "<h1 id='welcome'>Welcome</h1>"},
        {"level": 2, "text": "Programs", "selector": "#programs", "html": "<h2 id='programs'>Programs</h2>"},
    ])
    assert out and out[0]["rule_id"] == "headings_review"
    assert out[0]["category"] == "content"
    assert len(out) == 2 and out[0]["selector"] == "#welcome"
    assert json.loads(out[1]["html_snippet"])["text"] == "Programs"


@pytest.mark.asyncio
async def test_sensitive_keywords_are_positioned_content_occurrences():
    class Page:
        async def evaluate(self, _script, patterns):
            assert patterns == ["blacklist", "sanity check"]
            return [
                {"patternIndex": 0, "matchedText": "blacklist", "context": "review the blacklist", "selector": "#intro", "bbox": {"x": 10, "y": 20, "width": 50, "height": 14}},
                {"patternIndex": 1, "matchedText": "sanity check", "context": "run a sanity check", "selector": "#check", "bbox": {"x": 10, "y": 80, "width": 80, "height": 14}},
            ]

    serialized = "<html><body><img alt='Blacklist policy' title='Blacklist policy'><a>blacklist</a><p>blacklist</p><a>sanity check</a></body></html>"
    out = await check_sensitive_keywords(Page(), [{
        "id": "sensitive_keywords", "label": "Sensitive keywords", "patterns": ["blacklist", "sanity check"],
    }], serialized)
    assert [json.loads(item["html_snippet"])["matched_text"].lower() for item in out] == ["blacklist", "blacklist", "blacklist", "sanity check"]
    assert all(item["category"] == "content" and item["manual_review"] is True for item in out)
    assert out[0]["bbox"]["y"] == 20 and out[0]["viewport"] == "desktop"


def test_network_requests_review_dedupes_domains():
    ctx = ResponseContext(requests=[
        NetworkRequest(url="https://ga.com/a", domain="google-analytics.com", resource_type="script", is_external=True),
        NetworkRequest(url="https://ga.com/b", domain="google-analytics.com", resource_type="script", is_external=True),
        NetworkRequest(url="https://self.test/x", domain="self.test", resource_type="script", is_external=False),
    ])
    out = check_network_requests_review(ctx)
    assert len(out) == 1 and out[0]["rule_id"] == "network_requests_review"
    payload = json.loads(out[0]["html_snippet"])
    assert payload["count"] == 2 and len(payload["external_requests"]) == 1  # deduped by domain


def test_network_requests_review_none_ctx():
    assert check_network_requests_review(None) == []


def test_run_policy_batch_aggregates():
    ctx = ResponseContext(requests=[NetworkRequest(url="https://x.com/a", domain="x.com", resource_type="script", is_external=True)])
    out = run_policy_batch(
        "accessibility statement", [{"level": 1, "text": "H"}],
        [{"action": "/a", "method": "get", "field_count": 1}], ctx, _RULES,
    )
    ids = {r["rule_id"] for r in out}
    assert {"find_accessibility", "forms_inventory", "headings_review", "network_requests_review"} <= ids


# --- admin endpoint validation ------------------------------------------

def test_clean_rules_valid():
    cleaned = _clean_rules([{"id": "r1", "label": "R1", "patterns": ["a", " b "]}])
    assert cleaned == [{"id": "r1", "label": "R1", "patterns": ["a", "b"]}]


def test_clean_rules_rejects_empty():
    with pytest.raises(HTTPException):
        _clean_rules([{"id": "", "patterns": []}])
    with pytest.raises(HTTPException):
        _clean_rules("not a list")
