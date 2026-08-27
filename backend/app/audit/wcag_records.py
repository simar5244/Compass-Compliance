"""Build uniform issue records for the custom rendered-layout checks.

Unlike axe results, these checks carry no axe tags, so we map them to their WCAG
criterion via the catalog in `app.audit.wcag`. The resulting record has the same
shape as `build_issue_records` / `finding_to_record` output, so persistence and
scoring treat all issues identically — and the criterion's level/version drive
the same WCAG bucketing every other accessibility check uses.
"""

from __future__ import annotations

from app.audit.wcag import CRITERIA


def accessibility_record(
    *,
    check_id: str,
    criterion_id: str,
    impact: str,
    description: str,
    remediation: str,
    manual_review: bool = False,
    selector: str | None = None,
    html_snippet: str | None = None,
    bbox: dict | None = None,
    viewport: str | None = None,
    weight: float = 1.0,
    reference_url: str = "https://www.w3.org/WAI/WCAG22/Understanding/",
) -> dict:
    """One issue record for a custom accessibility check, mapped to ``criterion_id``."""
    crit = CRITERIA.get(criterion_id)
    return {
        "rule_id": check_id,
        "category": "accessibility",
        "subcategory": None,
        "weight": weight,
        "impact": impact,
        "description": description,
        "remediation": remediation,
        "reference_url": reference_url,
        "wcag_version": crit.version if crit else None,
        "wcag_level": crit.level if crit else None,
        "criterion_id": criterion_id,
        "criterion_name": crit.name if crit else None,
        "is_best_practice": False,
        "manual_review": manual_review,
        "selector": selector,
        "leaf_selector": None,
        "html_snippet": (html_snippet or "")[:2000],
        "wcag_tags": [],
        "bbox": bbox,
        "viewport": viewport,
    }
