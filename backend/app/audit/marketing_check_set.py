"""The Marketing module's check list, in the exact order it is presented.

Every entry here is produced elsewhere in the engine — SEO signals, sitemap
checks, the writing checks, a couple of axe rules. Listing a check does not move
it out of the module that owns it.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck

MarketingCheck = ModuleCheck

MARKETING_CHECKS: tuple[MarketingCheck, ...] = (
    MarketingCheck("sitemap_missing", "Add a structured sitemap for search engines", None, "Technical optimization"),
    MarketingCheck("spelling", "Check and fix misspellings", None, "Content optimization"),
    MarketingCheck("list", "Ensure lists are marked up correctly", ("2.0", "A", "4.1.1"), "Technical optimization"),
    MarketingCheck("url_file_extension", "Avoid file extensions for pages", None, "Technical optimization"),
    MarketingCheck("image_optimization", "Consider optimizing images", None, "Technical optimization"),
    MarketingCheck("thin_pages", 'Minimize "thin" pages', None, "Content optimization"),
    MarketingCheck("page-has-heading-one", "Ensure every page contains a top-level heading", ("2.0", "A", "1.3.1"), "Content optimization"),
    MarketingCheck("title_too_long", "Ensure page titles are not longer than 60 characters", None, "Content optimization"),
    MarketingCheck("meta_description", "Specify meta descriptions for relevant pages", None, "Content optimization"),
    MarketingCheck("page_missing_from_sitemap", "Add pages missing from Sitemap", None, "Technical optimization"),
    MarketingCheck("readability", "Consider making text easier to understand", None, "Content optimization"),
    MarketingCheck("meta_description_too_short", "Ensure meta descriptions are at least 60 characters long", None, "Content optimization"),
    MarketingCheck("listitem", "Write lists or groups of links semantically", ("2.0", "A", "1.3.1"), "Technical optimization"),
    MarketingCheck("empty-heading", "Ensure headings include text", ("2.0", "A", "1.3.1"), "Content optimization"),
    MarketingCheck("multiple_h1", "Avoid more than one H1 header per page", None, "Content optimization"),
    MarketingCheck("url_underscores", "Avoid underscores in URLs", None, "Technical optimization"),
    MarketingCheck("structured_data_missing", "Consider using structured data", None, "Technical optimization"),
)

MARKETING_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in MARKETING_CHECKS)
MARKETING_CHECK_BY_ID: dict[str, MarketingCheck] = {c.rule_id: c for c in MARKETING_CHECKS}


def marketing_rank(rule_id: str) -> int:
    """Position in the presented order; unlisted ids sort last."""
    try:
        return MARKETING_CHECK_ORDER.index(rule_id)
    except ValueError:
        return len(MARKETING_CHECK_ORDER)
