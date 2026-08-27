"""Privacy split into the three areas its overview reports on.

As with Marketing and User Experience, the split is the ``subcategory`` each
check already carries in :mod:`app.audit.privacy_check_set`: consent is what a
visitor is asked to agree to, audit is what the site collects and discloses,
security is how the connection and cookies are protected.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck
from app.audit.privacy_check_set import PRIVACY_CHECKS

CONSENT = "Consent"
AUDIT = "Audit"
SECURITY = "Security"


def _subset(subcategory: str) -> tuple[ModuleCheck, ...]:
    """The module's own checks for one area, kept in the module's order."""
    return tuple(check for check in PRIVACY_CHECKS if check.subcategory == subcategory)


CONSENT_CHECKS: tuple[ModuleCheck, ...] = _subset(CONSENT)
AUDIT_CHECKS: tuple[ModuleCheck, ...] = _subset(AUDIT)
SECURITY_CHECKS: tuple[ModuleCheck, ...] = _subset(SECURITY)

CONSENT_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in CONSENT_CHECKS)
AUDIT_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in AUDIT_CHECKS)
SECURITY_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in SECURITY_CHECKS)
