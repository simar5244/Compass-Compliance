"""Registry of the modules that present an explicit, ordered check list.

A module's list is presentation only: several of its checks are produced by other
parts of the engine and keep the category that owns them, so a check can appear
under more than one module. The catalog reads names and criteria from here, and
the API reads the order.
"""

from __future__ import annotations

from app.audit.accessibility_check_set import (
    ACCESSIBILITY_CHECK_ORDER,
    ACCESSIBILITY_CHECKS,
)
from app.audit.content_accessibility_check_set import (
    CONTENT_ACCESSIBILITY_CHECK_ORDER,
    CONTENT_ACCESSIBILITY_CHECKS,
)
from app.audit.content_check_set import CONTENT_CHECK_ORDER, CONTENT_CHECKS
from app.audit.content_seo_check_set import CONTENT_SEO_CHECK_ORDER, CONTENT_SEO_CHECKS
from app.audit.marketing_check_set import MARKETING_CHECK_ORDER, MARKETING_CHECKS
from app.audit.marketing_group_check_sets import (
    CONTENT_OPTIMIZATION_CHECK_ORDER,
    CONTENT_OPTIMIZATION_CHECKS,
    TECHNICAL_OPTIMIZATION_CHECK_ORDER,
    TECHNICAL_OPTIMIZATION_CHECKS,
)
from app.audit.policies_check_set import POLICIES_CHECK_ORDER, POLICIES_CHECKS
from app.audit.privacy_check_set import PRIVACY_CHECK_ORDER, PRIVACY_CHECKS
from app.audit.privacy_group_check_sets import (
    AUDIT_CHECK_ORDER,
    AUDIT_CHECKS,
    CONSENT_CHECK_ORDER,
    CONSENT_CHECKS,
    SECURITY_CHECK_ORDER,
    SECURITY_CHECKS,
)
from app.audit.ux_check_set import UX_CHECK_ORDER, UX_CHECKS
from app.audit.ux_group_check_sets import (
    FUNCTIONALITY_CHECK_ORDER,
    FUNCTIONALITY_CHECKS,
    MOBILE_CHECK_ORDER,
    MOBILE_CHECKS,
    WEB_VITALS_CHECK_ORDER,
    WEB_VITALS_CHECKS,
)
from app.audit.ttu_check_set import (
    BRAND_STANDARDS_CHECK_ORDER, BRAND_STANDARDS_CHECKS,
    TTU_COMPLIANCE_CHECK_ORDER, TTU_COMPLIANCE_CHECKS,
)

#: Presented order per module, keyed by the category the UI filters on.
MODULE_CHECK_ORDER: dict[str, tuple[str, ...]] = {
    "content": CONTENT_CHECK_ORDER,
    "accessibility": ACCESSIBILITY_CHECK_ORDER,
    "marketing": MARKETING_CHECK_ORDER,
    "ux": UX_CHECK_ORDER,
    "privacy": PRIVACY_CHECK_ORDER,
    "policies": POLICIES_CHECK_ORDER,
    # Sub-views of Content rather than scored categories of their own.
    "content-accessibility": CONTENT_ACCESSIBILITY_CHECK_ORDER,
    "content-seo": CONTENT_SEO_CHECK_ORDER,
    # The two halves Marketing reports on; together they cover it exactly once.
    "content-optimization": CONTENT_OPTIMIZATION_CHECK_ORDER,
    "technical-optimization": TECHNICAL_OPTIMIZATION_CHECK_ORDER,
    # The areas User Experience reports on.
    "functionality": FUNCTIONALITY_CHECK_ORDER,
    "web-vitals": WEB_VITALS_CHECK_ORDER,
    "mobile": MOBILE_CHECK_ORDER,
    # The areas Privacy reports on.
    "consent": CONSENT_CHECK_ORDER,
    "audit": AUDIT_CHECK_ORDER,
    "security": SECURITY_CHECK_ORDER,
    "ttu-compliance": TTU_COMPLIANCE_CHECK_ORDER,
    "brand-standards": BRAND_STANDARDS_CHECK_ORDER,
}

#: Modules are consulted in this order when two of them name the same check; the
#: wording is identical across lists where they overlap, so first wins.
_PRECEDENCE = (
    CONTENT_CHECKS,
    ACCESSIBILITY_CHECKS,
    MARKETING_CHECKS,
    UX_CHECKS,
    PRIVACY_CHECKS,
    POLICIES_CHECKS,
    CONTENT_ACCESSIBILITY_CHECKS,
    CONTENT_SEO_CHECKS,
    CONTENT_OPTIMIZATION_CHECKS,
    TECHNICAL_OPTIMIZATION_CHECKS,
    FUNCTIONALITY_CHECKS,
    WEB_VITALS_CHECKS,
    MOBILE_CHECKS,
    CONSENT_CHECKS,
    AUDIT_CHECKS,
    SECURITY_CHECKS,
    TTU_COMPLIANCE_CHECKS,
    BRAND_STANDARDS_CHECKS,
)

LISTED_CHECKS: dict[str, object] = {}
for _module in _PRECEDENCE:
    for _check in _module:
        LISTED_CHECKS.setdefault(_check.rule_id, _check)

#: Every rule id any module lists.
ALL_LISTED_RULE_IDS: frozenset[str] = frozenset(LISTED_CHECKS)


def listed_display_name(rule_id: str) -> str | None:
    check = LISTED_CHECKS.get(rule_id)
    return getattr(check, "display_name", None)


def listed_criterion_text(rule_id: str) -> str | None:
    """The catalog's 'WCAG 2.0 A 2.4.4' form, or None when the check has no criterion."""
    check = LISTED_CHECKS.get(rule_id)
    criterion = getattr(check, "criterion", None)
    if not criterion:
        return None
    version, level, identifier = criterion
    return f"WCAG {version} {level} {identifier}"


def module_rule_ids_in_order() -> list[str]:
    """All listed rule ids, module by module, without duplicates."""
    seen: list[str] = []
    for order in MODULE_CHECK_ORDER.values():
        seen.extend(rule_id for rule_id in order if rule_id not in seen)
    return seen
