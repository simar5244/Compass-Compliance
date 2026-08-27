"""The Policies module's check list, in the exact order it is presented.

These are the policy keyword engine's checks plus the two policy-link checks.
The Sensitive keywords row carries a live occurrence count in the UI
("Sensitive keywords – 1 time"), so its stored title is the bare noun.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck

PoliciesCheck = ModuleCheck

POLICIES_CHECKS: tuple[PoliciesCheck, ...] = (
    PoliciesCheck("policy-privacy", "Link every page to a privacy policy", None, "Policy review"),
    PoliciesCheck("policy-cookie", "Add a cookie disclaimer to every page", None, "Policy review"),
    PoliciesCheck("policies_sensitive_keywords", "Sensitive keywords", None, "Policy review"),
    PoliciesCheck("texas_senate_bill_17", "Texas Senate Bill 17", None, "Policy review"),
    PoliciesCheck("find_accessibility", 'Find "accessibility"', None, "Policy review"),
    PoliciesCheck("eeo_terms", "Identify Pages using EEO terms", None, "Policy review"),
    PoliciesCheck("affirmative_action", "Identify Pages using Affirmative Action terms", None, "Policy review"),
    PoliciesCheck("forms_inventory", "Find Forms and Applications", None, "Policy review"),
)

POLICIES_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in POLICIES_CHECKS)
POLICIES_CHECK_BY_ID: dict[str, PoliciesCheck] = {c.rule_id: c for c in POLICIES_CHECKS}


def policies_rank(rule_id: str) -> int:
    """Position in the presented order; unlisted ids sort last."""
    try:
        return POLICIES_CHECK_ORDER.index(rule_id)
    except ValueError:
        return len(POLICIES_CHECK_ORDER)
