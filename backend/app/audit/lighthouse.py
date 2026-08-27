"""Group C: Lighthouse performance checks.

One Lighthouse run per page yields many audits; we map ~23 of them to our checks.
``parse_lighthouse_result`` is a pure function over a Lighthouse result dict, so
the whole mapping is unit-tested with fixture JSON and needs no Node install.

Lighthouse itself is OFF by default (``settings.enable_lighthouse``) because a run
adds ~10-15s per page. When disabled, ``run_lighthouse_checks`` returns nothing and
the perf checks simply have no data (the UI shows an "enable in settings" note).
Runs are capped by a concurrency semaphore.
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import shutil

from app.config import settings

logger = logging.getLogger("wcag_scanner.audit.lighthouse")

_IMPACT = {"error": "serious", "warning": "moderate", "info": "minor"}
_SCORE_FAIL = 0.9  # Lighthouse audit score below this counts as a failure.

# Opportunity/diagnostic audits scored 0..1 — fire when score < _SCORE_FAIL.
# (audit_id, rule_id, severity, category, subcategory)
_SCORE_AUDITS = [
    ("render-blocking-resources", "render_blocking_resources", "warning", "ux", "Web Vitals"),
    ("unused-javascript", "unused_javascript", "warning", "ux", "Web Vitals"),
    ("unused-css-rules", "unused_css", "warning", "ux", "Web Vitals"),
    ("legacy-javascript", "legacy_javascript", "warning", "ux", "Web Vitals"),
    ("third-party-summary", "third_party_impact", "warning", "ux", "Web Vitals"),
    ("long-tasks", "long_main_thread_tasks", "warning", "ux", "Web Vitals"),
    ("uses-long-cache-ttl", "cache_ttl", "warning", "ux", "Web Vitals"),
    ("font-display", "font_display", "warning", "ux", "Web Vitals"),
    ("unminified-css", "unminified_css", "warning", "ux", "Web Vitals"),
    ("unminified-javascript", "unminified_javascript", "warning", "ux", "Web Vitals"),
    ("uses-rel-preconnect", "preconnect_missing", "warning", "ux", "Web Vitals"),
    ("network-rtt", "high_rtt", "warning", "ux", "Web Vitals"),
    ("bootup-time", "js_execution_time", "warning", "ux", "Web Vitals"),
    ("offscreen-images", "defer_offscreen_images", "error", "ux", "Web Vitals"),
    ("modern-image-formats", "image_modern_format", "warning", "ux", "Web Vitals"),
    ("uses-responsive-images", "image_resolution", "warning", "ux", "Web Vitals"),
    ("uses-optimized-images", "image_optimization", "warning", "content", "Images"),
    ("uses-passive-event-listeners", "passive_event_listeners", "info", "ux", "Web Vitals"),
]

# Metric audits — fire when numericValue crosses a threshold.
# (audit_id, rule_id, severity, threshold, category, subcategory)
_THRESHOLD_AUDITS = [
    ("dom-size", "excessive_dom_size", "warning", 1500, "ux", "Web Vitals"),
    ("total-byte-weight", "total_page_weight", "warning", 1_600_000, "ux", "Web Vitals"),
    ("interactive", "time_to_interactive", "info", 5000, "ux", "Web Vitals"),
]


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


def _items(audit: dict, limit: int = 10) -> list:
    items = ((audit or {}).get("details") or {}).get("items") or []
    return items[:limit]


def parse_lighthouse_result(lhr: dict) -> list[dict]:
    """Map a Lighthouse result dict to check records. Pure + exception-safe."""
    audits = (lhr or {}).get("audits") or {}
    out: list[dict] = []

    for audit_id, rule_id, sev, cat, sub in _SCORE_AUDITS:
        a = audits.get(audit_id)
        if not a:
            continue
        score = a.get("score")
        if score is None or score >= _SCORE_FAIL:
            continue
        out.append(_rec(
            rule_id, cat, sub, sev, a.get("title") or rule_id,
            a.get("description") or "See Lighthouse guidance to resolve this performance issue.",
            html_snippet={"score": score, "displayValue": a.get("displayValue"), "items": _items(a)},
        ))

    for audit_id, rule_id, sev, threshold, cat, sub in _THRESHOLD_AUDITS:
        a = audits.get(audit_id)
        if not a:
            continue
        num = a.get("numericValue")
        if num is None or num <= threshold:
            continue
        out.append(_rec(
            rule_id, cat, sub, sev, a.get("title") or rule_id,
            a.get("description") or "Bring this metric under the recommended threshold.",
            html_snippet={"numericValue": num, "threshold": threshold, "displayValue": a.get("displayValue")},
        ))

    out += _missing_files(audits.get("network-requests"))
    return out


def _missing_files(network_audit: dict | None) -> list[dict]:
    """C22/C23: 404 script/stylesheet requests from the network-requests audit."""
    items = ((network_audit or {}).get("details") or {}).get("items") or []
    js_404, css_404 = [], []
    for it in items:
        try:
            status = int(it.get("statusCode", 0))
        except (TypeError, ValueError):
            status = 0
        if status != 404:
            continue
        rtype = (it.get("resourceType") or "").lower()
        if rtype == "script":
            js_404.append(it.get("url", ""))
        elif rtype == "stylesheet":
            css_404.append(it.get("url", ""))
    out = []
    if js_404:
        out.append(_rec(
            "missing_js_files", "ux", "Functionality", "warning",
            "JavaScript file(s) failed to load (404)",
            "Fix or remove references to missing JavaScript files.",
            html_snippet={"urls": js_404[:20]},
        ))
    if css_404:
        out.append(_rec(
            "missing_css_files", "ux", "Functionality", "warning",
            "CSS file(s) failed to load (404)",
            "Fix or remove references to missing stylesheet files.",
            html_snippet={"urls": css_404[:20]},
        ))
    return out


# All rule_ids Group C can emit — used by the frontend catalog / empty state.
LIGHTHOUSE_RULE_IDS = (
    [r[1] for r in _SCORE_AUDITS] + [r[1] for r in _THRESHOLD_AUDITS]
    + ["missing_js_files", "missing_css_files"]
)

_sem = asyncio.Semaphore(max(1, settings.lighthouse_max_concurrent))


def _lighthouse_bin() -> str | None:
    """Locate a lighthouse executable (local install preferred, then PATH)."""
    local = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "node", "node_modules", ".bin", "lighthouse")
    if os.path.exists(local):
        return local
    return shutil.which("lighthouse")


async def run_lighthouse(url: str) -> dict | None:
    """Run Lighthouse (own headless Chrome) and return the parsed result, or None."""
    binary = _lighthouse_bin()
    if not binary:
        logger.warning("lighthouse binary not found; performance checks unavailable")
        return None
    cmd = [
        binary, url, "--output=json", "--output-path=stdout",
        "--only-categories=performance", "--quiet",
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
    ]
    async with _sem:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            out, _ = await asyncio.wait_for(proc.communicate(), timeout=settings.lighthouse_timeout_s)
        except Exception as exc:
            logger.warning("lighthouse run failed for %s: %s", url, exc)
            return None
    try:
        return json.loads(out.decode("utf-8", "ignore"))
    except Exception:
        logger.warning("could not parse lighthouse output for %s", url)
        return None


async def run_lighthouse_checks(url: str) -> list[dict]:
    """Group C entrypoint. No-op unless enable_lighthouse is set."""
    if not settings.enable_lighthouse:
        return []
    lhr = await run_lighthouse(url)
    if lhr is None:
        return []
    try:
        return parse_lighthouse_result(lhr)
    except Exception:
        logger.exception("parsing lighthouse result failed for %s", url)
        return []


# --- Web Vitals capture -------------------------------------------------
# Separate from the per-page performance checks above: those run for every page
# and are off by default because they are slow. The vitals screen needs one
# measurement of the site's front door per form factor, which is cheap enough
# to take on every scan.

#: What a visitor is emulated as, and how the result is labelled.
VITALS_EXPERIENCES: tuple[tuple[str, str, str], ...] = (
    ("desktop", "Desktop", "Dense 4G"),
    ("mobile", "Mobile", "Regular 3G"),
)


def _metric(audits: dict, audit_id: str) -> float | None:
    value = (audits.get(audit_id) or {}).get("numericValue")
    return float(value) if isinstance(value, (int, float)) else None


def parse_web_vitals(lhr: dict) -> dict:
    """The vitals, and the loading filmstrip, from one Lighthouse result.

    ``first_input_delay_ms`` is Lighthouse's *max potential* FID: real FID can
    only be measured from actual visitors, so this is the lab estimate of the
    worst first interaction, which is what a lab tool can honestly report.
    """
    audits = lhr.get("audits") or {}
    score = ((lhr.get("categories") or {}).get("performance") or {}).get("score")
    frames = ((audits.get("screenshot-thumbnails") or {}).get("details") or {}).get("items") or []
    return {
        "score": round(score * 100) if isinstance(score, (int, float)) else None,
        "largest_contentful_paint_ms": _metric(audits, "largest-contentful-paint"),
        "first_input_delay_ms": _metric(audits, "max-potential-fid"),
        "cumulative_layout_shift": _metric(audits, "cumulative-layout-shift"),
        "total_blocking_time_ms": _metric(audits, "total-blocking-time"),
        "first_contentful_paint_ms": _metric(audits, "first-contentful-paint"),
        "speed_index_ms": _metric(audits, "speed-index"),
        "frames": [
            {"timing_ms": frame.get("timing"), "data": frame.get("data")}
            for frame in frames
            if frame.get("data")
        ],
    }


async def run_web_vitals(url: str, form_factor: str) -> dict | None:
    """Measure one page as one kind of visitor. Returns None if it cannot run."""
    binary = _lighthouse_bin()
    if not binary:
        logger.warning("lighthouse binary not found; web vitals unavailable")
        return None
    cmd = [
        binary, url, "--output=json", "--output-path=stdout",
        "--only-categories=performance", "--quiet",
        "--chrome-flags=--headless=new --no-sandbox --disable-gpu --disable-dev-shm-usage",
    ]
    if form_factor == "desktop":
        cmd.append("--preset=desktop")
    async with _sem:
        try:
            proc = await asyncio.create_subprocess_exec(
                *cmd, stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.DEVNULL,
            )
            out, _ = await asyncio.wait_for(
                proc.communicate(), timeout=settings.lighthouse_timeout_s
            )
        except Exception as exc:
            logger.warning("web vitals run failed for %s (%s): %s", url, form_factor, exc)
            return None
    try:
        return parse_web_vitals(json.loads(out.decode("utf-8", "ignore")))
    except Exception:
        logger.warning("could not parse web vitals for %s (%s)", url, form_factor)
        return None


async def capture_web_vitals(url: str) -> list[dict]:
    """Measure the page as each kind of visitor, worst experience last."""
    if not settings.enable_web_vitals:
        return []
    captured: list[dict] = []
    for form_factor, device, connection in VITALS_EXPERIENCES:
        result = await run_web_vitals(url, form_factor)
        if result is None:
            continue
        captured.append({**result, "form_factor": form_factor, "device": device, "connection": connection})
    return captured
