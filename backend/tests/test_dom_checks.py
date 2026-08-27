"""Group B sub-batch 1 DOM/context checks — pure functions over signals + ctx."""

import json

from app.audit.dom_checks import (
    check_cookie_inventory,
    check_cookies_review,
    check_email_addresses,
    check_form_data,
    check_javascript_errors,
    check_javascript_logs,
    check_missing_images,
    check_phone_numbers,
    run_dom_checks,
)
from app.render.response_context import ConsoleMessage, Cookie, ResponseContext


def _sig(**kw):
    base = {"forms": [], "brokenImages": [], "visibleText": "", "hasPrivacyLink": False}
    base.update(kw)
    return base


# --- B4 forms ------------------------------------------------------------

def test_form_data_fires_and_is_assisted():
    out = check_form_data(_sig(forms=[{"action": "/submit", "method": "post", "sensitive_fields": ["password"]}]))
    assert len(out) == 1 and out[0]["rule_id"] == "form_data_review"
    assert out[0]["manual_review"] is True  # assisted → excluded from scoring
    assert json.loads(out[0]["html_snippet"])["forms"][0]["sensitive_fields"] == ["password"]


def test_form_data_clears_without_forms():
    assert check_form_data(_sig()) == []


# --- B5 phone ------------------------------------------------------------

def test_phone_matches_valid_us_numbers():
    text = "Call (806) 742-1234 or 806-742-5678 or +1 806.742.9999 today."
    out = check_phone_numbers(_sig(visibleText=text))
    assert len(out) == 1
    nums = json.loads(out[0]["html_snippet"])["phone_numbers"]
    assert len(nums) == 3


def test_phone_rejects_non_numbers():
    assert check_phone_numbers(_sig(visibleText="order #12345 costs 99 dollars in 2026")) == []


# --- B6 email ------------------------------------------------------------

def test_email_matches_and_dedupes():
    text = "Contact k12@ttu.edu or k12@ttu.edu or admin@depts.ttu.edu."
    out = check_email_addresses(_sig(visibleText=text))
    emails = json.loads(out[0]["html_snippet"])["email_addresses"]
    assert set(emails) == {"k12@ttu.edu", "admin@depts.ttu.edu"}


def test_email_clears_when_none():
    assert check_email_addresses(_sig(visibleText="no addresses here at all")) == []


# --- B8 broken images ----------------------------------------------------

def test_missing_images_one_issue_per_broken():
    out = check_missing_images(_sig(brokenImages=[
        {"src": "/a.gif", "selector": "img:nth-of-type(1)"},
        {"src": "/b.png", "selector": "img:nth-of-type(2)"},
    ]))
    assert len(out) == 2
    assert all(r["rule_id"] == "missing_images" and r["manual_review"] is False for r in out)
    assert out[0]["selector"] == "img:nth-of-type(1)"


# --- B3 cookies_review ---------------------------------------------------

def test_cookies_review_fires_cookies_without_privacy_link():
    ctx = ResponseContext(cookies=[Cookie(name="sid")])
    out = check_cookies_review(ctx, _sig(hasPrivacyLink=False))
    assert len(out) == 1 and out[0]["rule_id"] == "cookies_review"
    assert out[0]["impact"] == "serious" and out[0]["manual_review"] is False


def test_cookies_review_clears_with_privacy_link():
    ctx = ResponseContext(cookies=[Cookie(name="sid")])
    assert check_cookies_review(ctx, _sig(hasPrivacyLink=True)) == []


def test_cookies_review_clears_without_cookies():
    assert check_cookies_review(ResponseContext(cookies=[]), _sig()) == []


def test_cookie_inventory_produces_review_and_information_rows():
    ctx = ResponseContext(cookies=[Cookie(name="sid", domain="example.com", secure=True)])
    out = check_cookie_inventory(ctx)
    assert [item["rule_id"] for item in out] == ["privacy_cookies_review", "cookies_information"]
    assert all(item["manual_review"] is True for item in out)
    payload = json.loads(out[1]["html_snippet"])
    assert payload["cookies"] == [{"name": "sid", "domain": "example.com", "path": "/", "secure": True}]


def test_cookie_inventory_clears_without_cookies():
    assert check_cookie_inventory(ResponseContext()) == []


# --- B9 JS errors --------------------------------------------------------

def test_javascript_errors_aggregates_page_and_console():
    ctx = ResponseContext(
        page_errors=["TypeError: x is not a function"],
        console_messages=[ConsoleMessage(level="error", text="Failed to load resource")],
    )
    out = check_javascript_errors(ctx)
    assert len(out) == 1 and out[0]["rule_id"] == "javascript_errors"
    payload = json.loads(out[0]["html_snippet"])
    assert payload["count"] == 2


def test_javascript_errors_clears_when_none():
    assert check_javascript_errors(ResponseContext()) == []


# --- B10 JS logs ---------------------------------------------------------

def test_javascript_logs_assisted_and_excludes_errors():
    ctx = ResponseContext(console_messages=[
        ConsoleMessage(level="warning", text="deprecated API"),
        ConsoleMessage(level="log", text="debug info"),
        ConsoleMessage(level="error", text="an error"),  # excluded — that's B9's job
    ])
    out = check_javascript_logs(ctx)
    assert len(out) == 1 and out[0]["manual_review"] is True
    assert json.loads(out[0]["html_snippet"])["count"] == 2


# --- runner --------------------------------------------------------------

def test_run_dom_checks_none_ctx_is_safe():
    # DOM-only checks still run; ctx-based ones skip cleanly.
    out = run_dom_checks(_sig(visibleText="mail me at a@b.com"), None, "http://x")
    ids = {r["rule_id"] for r in out}
    assert "email_addresses_exposed" in ids
    assert "javascript_errors" not in ids and "cookies_review" not in ids
