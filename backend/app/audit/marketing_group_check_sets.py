"""Marketing split into the two halves the overview reports on.

The split is the ``subcategory`` each check already carries in
:mod:`app.audit.marketing_check_set` — content optimization is what an editor
changes by rewriting a page, technical optimization is how the site is built and
addressed for a crawler. Deriving them here keeps one source of truth: moving a
check between halves means editing its subcategory, nothing else.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck
from app.audit.marketing_check_set import MARKETING_CHECKS

CONTENT_OPTIMIZATION = "Content optimization"
TECHNICAL_OPTIMIZATION = "Technical optimization"


def _subset(subcategory: str) -> tuple[ModuleCheck, ...]:
    """The module's own checks for one half, kept in the module's order."""
    return tuple(check for check in MARKETING_CHECKS if check.subcategory == subcategory)


CONTENT_OPTIMIZATION_CHECKS: tuple[ModuleCheck, ...] = _subset(CONTENT_OPTIMIZATION)
TECHNICAL_OPTIMIZATION_CHECKS: tuple[ModuleCheck, ...] = _subset(TECHNICAL_OPTIMIZATION)

CONTENT_OPTIMIZATION_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in CONTENT_OPTIMIZATION_CHECKS)
TECHNICAL_OPTIMIZATION_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in TECHNICAL_OPTIMIZATION_CHECKS)
