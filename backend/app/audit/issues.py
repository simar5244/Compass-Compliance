"""Flatten raw axe result buckets into one issue record per offending DOM node.

Two buckets become records:
  * violations  → definite failures, `manual_review=False` (these are scored)
  * incomplete  → axe couldn't decide; surfaced as `manual_review=True` and
                  excluded from scoring, matching how non-automatable criteria
                  are handled.
Each record carries its WCAG mapping (version/level/criterion) and an ORIGINAL
remediation string from `app.audit.wcag`. Bounding boxes are attached later by
the scan engine, which has the live page.
"""

from __future__ import annotations

from typing import Any

from app.audit.wcag import classify, remediation_for


def _selector_str(target: list[Any]) -> str:
    """axe 'target' is a list of segments (shadow-piercing). Join for display;
    the last segment is the light-DOM selector used for bbox lookup."""
    parts: list[str] = []
    for seg in target:
        if isinstance(seg, list):
            parts.append(" >> ".join(str(s) for s in seg))
        else:
            parts.append(str(seg))
    return " >> ".join(parts)


def _leaf_selector(target: list[Any]) -> str | None:
    """The innermost CSS selector, for a best-effort getBoundingClientRect."""
    if not target:
        return None
    last = target[-1]
    if isinstance(last, list):
        return str(last[-1]) if last else None
    return str(last)


def _records_from_bucket(bucket: list[dict], *, manual_review: bool) -> list[dict]:
    records: list[dict] = []
    for item in bucket:
        tags = item.get("tags", [])
        mapping = classify(tags)
        remediation = remediation_for(mapping.criterion_id, mapping.criterion_name, item.get("help", ""))
        for node in item.get("nodes", []):
            target = node.get("target", []) or []
            records.append({
                "rule_id": item.get("id", ""),
                "category": "accessibility",
                "subcategory": None,
                "weight": 1.0,
                "impact": node.get("impact") or item.get("impact"),
                "description": item.get("description", ""),
                "remediation": remediation,
                "reference_url": item.get("helpUrl", ""),
                "wcag_version": mapping.version,
                "wcag_level": mapping.level,
                "criterion_id": mapping.criterion_id,
                "criterion_name": mapping.criterion_name,
                "is_best_practice": mapping.is_best_practice,
                "manual_review": manual_review,
                "selector": _selector_str(target),
                "leaf_selector": _leaf_selector(target),
                "html_snippet": (node.get("html") or "")[:2000],
                "wcag_tags": tags,
            })
    return records


def build_issue_records(axe_result: dict) -> list[dict]:
    """All issue records for one page: scored violations + manual-review incompletes."""
    records = _records_from_bucket(axe_result.get("violations", []), manual_review=False)
    records += _records_from_bucket(axe_result.get("incomplete", []), manual_review=True)
    return records


def pass_summary(axe_result: dict) -> list[dict]:
    """Per-criterion pass counts, used by the scoring engine's affected-page math."""
    summary: list[dict] = []
    for item in axe_result.get("passes", []):
        mapping = classify(item.get("tags", []))
        summary.append({
            "rule_id": item.get("id", ""),
            "criterion_id": mapping.criterion_id,
            "wcag_level": mapping.level,
            "wcag_version": mapping.version,
            "node_count": len(item.get("nodes", [])),
        })
    return summary
