"""Content SEO: the search-engine work a content editor can do.

A filtered view over Content, in the same spirit as content accessibility: it
leaves out the technical SEO that belongs to a developer (redirects, canonical
tags, sitemaps, robots rules) and keeps what an author fixes by editing words —
titles, meta descriptions, headings, alt text and the depth of a page's content.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck

ContentSEOCheck = ModuleCheck

CONTENT_SEO_CHECKS: tuple[ContentSEOCheck, ...] = (
    ModuleCheck("spelling", "Check and fix misspellings", None, "Writing"),
    ModuleCheck("image-alt-content", "Ensure alternative text is appropriate", ("2.0", "A", "1.1.1"), "Images"),
    ModuleCheck("thin_pages", "Minimize 'thin' pages", None, "Writing"),
    ModuleCheck("page-has-heading-one", "Ensure every page contains a top-level heading", ("2.0", "A", "1.3.1"), "Structure"),
    ModuleCheck("title_too_long", "Ensure page titles are not longer than 60 characters", None, "Metadata"),
    ModuleCheck("meta_description", "Specify meta descriptions for relevant pages", None, "Metadata"),
    ModuleCheck("readability", "Consider making text easier to understand", None, "Writing"),
    ModuleCheck("meta_description_too_short", "Ensure meta descriptions are at least 60 characters long", None, "Metadata"),
    ModuleCheck("empty-heading", "Ensure headings include text", ("2.0", "A", "1.3.1"), "Structure"),
    ModuleCheck("multiple_h1", "Avoid more than one H1 header per page", None, "Structure"),
    ModuleCheck("headings_review", "Review headings on this website", None, "Structure"),
)

CONTENT_SEO_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in CONTENT_SEO_CHECKS)
CONTENT_SEO_CHECK_BY_ID: dict[str, ContentSEOCheck] = {c.rule_id: c for c in CONTENT_SEO_CHECKS}


def content_seo_rank(rule_id: str) -> int:
    """Position in the presented order; unlisted ids sort last."""
    try:
        return CONTENT_SEO_CHECK_ORDER.index(rule_id)
    except ValueError:
        return len(CONTENT_SEO_CHECK_ORDER)
