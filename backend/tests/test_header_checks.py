"""Group A (HTTP header/response) checks — pure functions over ResponseContext."""

import json

from app.audit.header_checks import (
    TTFB_THRESHOLD_MS,
    check_cookie_ssl,
    check_csp,
    check_privacy_enhanced,
    check_server_response_time,
    run_header_checks,
)
from app.render.response_context import Cookie, ResponseContext


def _ctx(**kw) -> ResponseContext:
    kw.setdefault("is_https", True)
    return ResponseContext(**kw)


# --- A2: CSP -------------------------------------------------------------

def test_csp_fires_when_header_absent():
    out = check_csp(_ctx(headers={}))
    assert len(out) == 1 and out[0]["rule_id"] == "csp_missing"
    assert out[0]["category"] == "privacy" and out[0]["impact"] == "moderate"


def test_csp_clears_when_header_present():
    assert check_csp(_ctx(headers={"content-security-policy": "default-src 'self'"})) == []


# --- A3: cookie Secure flag ---------------------------------------------

def test_cookie_ssl_fires_on_insecure_cookie_over_https():
    ctx = _ctx(cookies=[Cookie(name="sid", secure=False), Cookie(name="ok", secure=True)])
    out = check_cookie_ssl(ctx)
    assert len(out) == 1 and out[0]["rule_id"] == "cookie_ssl"
    payload = json.loads(out[0]["html_snippet"])
    assert payload["insecure_cookies"] == [{"name": "sid", "path": "/"}]


def test_cookie_ssl_clears_when_all_secure():
    assert check_cookie_ssl(_ctx(cookies=[Cookie(name="a", secure=True)])) == []


def test_cookie_ssl_never_fires_on_http_page():
    ctx = _ctx(is_https=False, cookies=[Cookie(name="sid", secure=False)])
    assert check_cookie_ssl(ctx) == []


# --- A4: X-Frame-Options / X-Content-Type-Options -----------------------

def test_privacy_enhanced_fires_when_either_header_missing():
    assert check_privacy_enhanced(_ctx(headers={"x-frame-options": "DENY"}))  # missing XCTO
    assert check_privacy_enhanced(_ctx(headers={"x-content-type-options": "nosniff"}))  # missing XFO
    out = check_privacy_enhanced(_ctx(headers={}))
    assert out[0]["rule_id"] == "privacy_enhanced" and out[0]["impact"] == "serious"


def test_privacy_enhanced_clears_when_both_present():
    ctx = _ctx(headers={"x-frame-options": "DENY", "x-content-type-options": "nosniff"})
    assert check_privacy_enhanced(ctx) == []


# --- A5: TTFB ------------------------------------------------------------

def test_server_response_time_fires_above_threshold():
    out = check_server_response_time(_ctx(ttfb_ms=TTFB_THRESHOLD_MS + 100))
    assert len(out) == 1 and out[0]["rule_id"] == "server_response_time"
    assert out[0]["category"] == "ux" and out[0]["impact"] == "minor"
    assert json.loads(out[0]["html_snippet"])["ttfb_ms"] == TTFB_THRESHOLD_MS + 100


def test_server_response_time_clears_at_or_below_threshold():
    assert check_server_response_time(_ctx(ttfb_ms=TTFB_THRESHOLD_MS)) == []
    assert check_server_response_time(_ctx(ttfb_ms=120)) == []


def test_server_response_time_clears_when_unmeasured():
    assert check_server_response_time(_ctx(ttfb_ms=None)) == []


# --- runner --------------------------------------------------------------

def test_run_header_checks_none_context_is_safe():
    assert run_header_checks(None) == []


def test_run_header_checks_aggregates_all():
    ctx = _ctx(headers={}, cookies=[Cookie(name="sid", secure=False)], ttfb_ms=900)
    ids = {r["rule_id"] for r in run_header_checks(ctx)}
    assert ids == {"csp_missing", "cookie_ssl", "privacy_enhanced", "server_response_time"}


def test_run_header_checks_clean_site_produces_nothing():
    ctx = _ctx(
        headers={
            "content-security-policy": "default-src 'self'",
            "x-frame-options": "DENY", "x-content-type-options": "nosniff",
        },
        cookies=[Cookie(name="sid", secure=True)], ttfb_ms=100,
    )
    assert run_header_checks(ctx) == []
