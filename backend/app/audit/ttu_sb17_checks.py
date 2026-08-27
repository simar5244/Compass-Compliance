"""Context-aware Texas Senate Bill 17 language review."""

from __future__ import annotations

import json
import re

TIER1_PATTERNS = ["diversity, equity and inclusion office", "DEI office", "office of diversity", "diversity officer", "chief diversity officer", "DEI initiative", "DEI program", "DEI training required", "DEI certification", "DEI committee"]
TIER2_PATTERNS = ["diversity and inclusion", "equity and inclusion", "DEI", "diversity initiative", "inclusion program", "affirmative action program", "EEO program"]
TIER3_PATTERNS = ["study of diversity", "research on diversity", "diversity in [field]", "historical diversity"]


def _find_non_overlapping(text: str, patterns: list[str], occupied: list[tuple[int, int]]) -> list[dict]:
    results: list[dict] = []
    for pattern in patterns:
        expression = re.escape(pattern).replace(r"\[field\]", r"[^\s,.;]+")
        for match in re.finditer(expression, text, re.I):
            span = (match.start(), match.end())
            if any(span[0] < end and span[1] > start for start, end in occupied):
                continue
            occupied.append(span)
            results.append({"text": match.group(0), "context": text[max(0, match.start() - 75):match.end() + 75]})
    return results


def classify_sb17_text(text: str) -> dict:
    occupied: list[tuple[int, int]] = []
    tier1 = _find_non_overlapping(text or "", TIER1_PATTERNS, occupied)
    tier2 = _find_non_overlapping(text or "", TIER2_PATTERNS, occupied)
    tier3 = _find_non_overlapping(text or "", TIER3_PATTERNS, occupied)
    action = "Legal review required" if tier1 else "Review recommended" if tier2 else "Monitor" if tier3 else ""
    return {"tier1_matches": tier1, "tier2_matches": tier2, "tier3_matches": tier3, "recommended_action": action}


def sb17_record(text: str) -> dict | None:
    matches = classify_sb17_text(text)
    if not any(matches[key] for key in ("tier1_matches", "tier2_matches", "tier3_matches")):
        return None
    severity = "error" if matches["tier1_matches"] else "warning" if matches["tier2_matches"] else "info"
    return {"rule_id": "sb17_context_aware", "category": "TTU Compliance", "subcategory": "Senate Bill 17", "weight": 1.0,
            "impact": severity, "description": "Texas Senate Bill 17 (2023) restricts DEI offices and programs at public universities. Pages containing certain language should be reviewed to ensure compliance. This check distinguishes between educational content about diversity (generally acceptable) and operational DEI program descriptions (requires legal review).",
            "remediation": "Review this page with TTU's Office of General Counsel before making changes. Tier 1 matches likely require immediate attention. Educational or historical references to diversity topics are generally acceptable under SB 17. Contact generalcounsel@ttu.edu for guidance.",
            "reference_url": "", "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
            "is_best_practice": False, "manual_review": True, "selector": None, "leaf_selector": None,
            "html_snippet": json.dumps(matches), "wcag_tags": []}


def run_ttu_sb17_checks(text: str) -> list[dict]:
    record = sb17_record(text)
    return [record] if record else []
