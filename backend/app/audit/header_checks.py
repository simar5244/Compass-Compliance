"""Group A: HTTP header / response checks.

Pure functions over the render-time ``ResponseContext`` (headers, cookies,
timing) — no DOM access, so each is trivially unit-testable with a hand-built
context. A1 (HSTS) already lives in ``privacy_checks`` and is intentionally not
duplicated here.
"""

from __future__ import annotations

import json
import logging

from app.render.response_context import ResponseContext

logger = logging.getLogger("wcag_scanner.audit.headers")

# Silktide severity label -> this project's impact scale, which drives both
# scoring weight and the dashboard's error/warning/info bucket.
_IMPACT = {"error": "serious", "warning": "moderate", "info": "minor"}

# A single slow response can be a cold start or a blip, so we flag per page but
# score it lightly (see scoring.yaml: max_impact 5 / worst_value 30).
TTFB_THRESHOLD_MS = 600


def _rec(rule_id, category, subcategory, severity, description, remediation, *, html_snippet=None):
    return {
        "rule_id": rule_id, "category": category, "subcategory": subcategory,
        "weight": 1.0, "impact": _IMPACT.get(severity, "minor"),
        "description": description, "remediation": remediation, "reference_url": "",
        "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
        "is_best_practice": False, "manual_review": False,
        "selector": None, "leaf_selector": None,
        "html_snippet": json.dumps(html_snippet) if html_snippet is not None else None,
        "wcag_tags": [],
    }


def check_csp(ctx: ResponseContext) -> list[dict]:
    """A2: Content-Security-Policy header absent."""
    if ctx.has_header("content-security-policy"):
        return []
    return [_rec(
        "csp_missing", "privacy", "Security", "warning",
        "No Content-Security-Policy header",
        "Add a Content-Security-Policy header so the browser restricts which sources it will load.",
        html_snippet={"header_present": False},
    )]


def check_cookie_ssl(ctx: ResponseContext) -> list[dict]:
    """A3: any cookie set without the Secure flag on an HTTPS page."""
    if not ctx.is_https:
        return []
    insecure = ctx.insecure_cookies()
    if not insecure:
        return []
    return [_rec(
        "cookie_ssl", "privacy", "Security", "warning",
        "Cookies set without the Secure flag on an HTTPS page",
        "Set the Secure attribute on every cookie so it is only ever sent over HTTPS.",
        html_snippet={"insecure_cookies": [{"name": c.name, "path": c.path} for c in insecure]},
    )]


def check_privacy_enhanced(ctx: ResponseContext) -> list[dict]:
    """A4: missing X-Frame-Options or X-Content-Type-Options."""
    xfo = ctx.has_header("x-frame-options")
    xcto = ctx.has_header("x-content-type-options")
    if xfo and xcto:
        return []
    return [_rec(
        "privacy_enhanced", "privacy", "Security", "error",
        "Missing X-Frame-Options or X-Content-Type-Options header",
        "Add X-Frame-Options (clickjacking) and X-Content-Type-Options: nosniff (MIME sniffing) headers.",
        html_snippet={"x_frame_options": xfo, "x_content_type_options": xcto},
    )]


def check_server_response_time(ctx: ResponseContext) -> list[dict]:
    """A5: TTFB over 600ms. One measurement per visit — flagged but scored light."""
    ttfb = ctx.ttfb_ms
    if ttfb is None or ttfb <= TTFB_THRESHOLD_MS:
        return []
    return [_rec(
        "server_response_time", "ux", "Web Vitals", "info",
        f"Slow server response — TTFB {ttfb}ms (over {TTFB_THRESHOLD_MS}ms)",
        "Reduce time-to-first-byte with caching, a CDN, or backend optimization; aim for under 600ms.",
        html_snippet={"ttfb_ms": ttfb},
    )]


_CHECKS = (check_csp, check_cookie_ssl, check_privacy_enhanced, check_server_response_time)


def run_header_checks(ctx: ResponseContext | None) -> list[dict]:
    """Run every Group A check against the render-time context. Never raises —
    a failing check logs and yields nothing rather than breaking the scan."""
    if ctx is None:
        logger.warning("run_header_checks got a None ResponseContext — pass-through is broken, 0 header checks will run")
        return []
    logger.debug("ResponseContext: ttfb=%sms, headers=%d, cookies=%d, requests=%d",
                 ctx.ttfb_ms, len(ctx.headers), len(ctx.cookies), len(ctx.requests))
    findings: list[dict] = []
    for fn in _CHECKS:
        try:
            findings += fn(ctx)
        except Exception:
            logger.exception("header check %s failed", fn.__name__)
    return findings
