"""TTU content-health checks and pure helpers used by finalize."""

from __future__ import annotations

import json
import re
from datetime import datetime, timezone


def _record(rule_id: str, subcategory: str, impact: str, description: str, remediation: str, snippet: dict) -> dict:
    return {"rule_id": rule_id, "category": "TTU Compliance", "subcategory": subcategory, "weight": 1.0,
            "impact": impact, "description": description, "remediation": remediation, "reference_url": "",
            "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
            "is_best_practice": False, "manual_review": True, "selector": None, "leaf_selector": None,
            "html_snippet": json.dumps(snippet), "wcag_tags": []}


def stale_content_record(last_changed_at, url: str, now: datetime | None = None) -> dict | None:
    if last_changed_at is None:
        return None
    now = now or datetime.now(timezone.utc)
    changed = last_changed_at if last_changed_at.tzinfo else last_changed_at.replace(tzinfo=timezone.utc)
    days = max(0, (now - changed).days)
    if days <= 365 or re.search(r"/privacy|/accessibility", url, re.I):
        return None
    return _record("stale_content", "Content Health", "warning",
        "Pages that have not been updated in over 12 months may contain outdated information. Review and update or archive.",
        "Review the page and update, archive, or confirm that its content is intentionally static.",
        {"last_changed_at": changed.isoformat(), "days_since_change": days, "url": url})


def outdated_year_records(text: str, url: str, current_year: int | None = None) -> list[dict]:
    if re.search(r"/history/|/archive/", url, re.I):
        return []
    year = current_year or datetime.now(timezone.utc).year
    matches: list[dict] = []
    for m in re.finditer(r"\b(Spring|Fall|Summer|Winter)\s+(20\d\d)\b|\b(20\d\d)[-–](\d\d)\b", text or "", re.I):
        start = int(m.group(2) or m.group(3))
        if (m.group(2) and start < year - 1) or (m.group(3) and start < year - 2):
            matches.append({"text": m.group(0), "year": start, "context": (text or "")[max(0, m.start() - 100):m.end() + 100]})
    if not matches:
        return []
    return [_record("outdated_year_reference", "Content Health", "info",
        "Page contains references to past years that may indicate outdated content (e.g. 'Fall 2022 semester', 'Spring 2023 enrollment').",
        "Confirm that the dated content is still accurate or update/archive it.", {"matches": matches})]


def former_staff_record(url: str, now: datetime | None = None) -> dict | None:
    if not re.search(r"/(staff|faculty|directory|people)(/|$)", url, re.I):
        return None
    return _record("former_staff_reference", "Content Health", "info",
        "Pages listing staff or faculty names should be reviewed periodically to ensure listed individuals are still current. This is an assisted check requiring human verification.",
        "Review the staff or faculty listing periodically for current names, roles, and contact details.",
        {"page_type": "staff_directory", "last_checked": (now or datetime.now(timezone.utc)).isoformat()})


async def run_ttu_freshness_checks(page) -> list[dict]:
    """Per-page freshness checks; stale-content persistence occurs at finalize."""
    try:
        text = await page.evaluate("() => document.body ? (document.body.innerText || '') : ''")
        url = str(getattr(page, "url", "") or "")
    except Exception:
        return []
    return outdated_year_records(text, url) + ([former_staff_record(url)] if former_staff_record(url) else [])
