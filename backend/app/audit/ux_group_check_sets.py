"""User Experience split into the areas its sub-screens report on.

As with Marketing, the split is the ``subcategory`` each check already carries
in :mod:`app.audit.ux_check_set`, so moving a check between areas means editing
its subcategory and nothing else.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck
from app.audit.ux_check_set import UX_CHECKS

FUNCTIONALITY = "Functionality"
WEB_VITALS = "Web Vitals"
MOBILE = "Mobile"


def _subset(subcategory: str) -> tuple[ModuleCheck, ...]:
    """The module's own checks for one area, kept in the module's order."""
    return tuple(check for check in UX_CHECKS if check.subcategory == subcategory)


FUNCTIONALITY_CHECKS: tuple[ModuleCheck, ...] = _subset(FUNCTIONALITY)
WEB_VITALS_CHECKS: tuple[ModuleCheck, ...] = _subset(WEB_VITALS)
MOBILE_CHECKS: tuple[ModuleCheck, ...] = _subset(MOBILE)

FUNCTIONALITY_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in FUNCTIONALITY_CHECKS)
WEB_VITALS_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in WEB_VITALS_CHECKS)
MOBILE_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in MOBILE_CHECKS)
