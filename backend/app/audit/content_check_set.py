"""The Content module's check list, in the exact order it is presented.

This is the single source of truth for what "Content" contains. Several of these
checks are produced by other parts of the engine and keep their own category —
the PDF checks are accessibility findings, the keyword checks are policy
findings, image optimization comes from Lighthouse — so Content lists them
without moving them out of the module that owns them.

Order is deliberate and is preserved verbatim in the API and the UI.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class ContentCheck:
    rule_id: str
    display_name: str
    #: (version, level, criterion) when the check maps to a WCAG success criterion.
    criterion: tuple[str, str, str] | None = None
    subcategory: str = "Writing"


CONTENT_CHECKS: tuple[ContentCheck, ...] = (
    ContentCheck("broken-links", "Check and fix broken links", None, "Links"),
    ContentCheck("spelling", "Check and fix misspellings"),
    ContentCheck("sensitive_keywords", "Sensitive keywords"),
    ContentCheck("link_purpose_unclear", "Ensure links explain their purpose", ("2.0", "A", "2.4.4"), "Links"),
    ContentCheck("image_optimization", "Consider optimizing images", None, "Images"),
    ContentCheck("new_tab_disclosure", "Ensure links explain they open in a new tab", ("2.0", "AAA", "3.2.5"), "Links"),
    ContentCheck("pdf_not_tagged", "Tag all PDFs", ("2.0", "A", "1.3.1"), "Documents"),
    ContentCheck("thin_pages", 'Minimize "thin" pages'),
    ContentCheck("grammar", "Review potential grammar errors"),
    ContentCheck("page-has-heading-one", "Ensure every page contains a top-level heading", ("2.0", "A", "1.3.1"), "Structure"),
    ContentCheck("pdf_no_title", "Ensure PDFs have a title", ("2.0", "A", "2.4.2"), "Documents"),
    ContentCheck("title_too_long", "Ensure page titles are not longer than 60 characters"),
    ContentCheck("reading_level_aaa", "Ensure content is not too difficult to understand", ("2.0", "AAA", "3.1.5")),
    ContentCheck("meta_description", "Specify meta descriptions for relevant pages"),
    ContentCheck("image-redundant-alt", "Avoid alternative text that is the same as adjacent text", ("2.0", "A", "1.1.1"), "Images"),
    ContentCheck("readability", "Consider making text easier to understand"),
    ContentCheck("meta_description_too_short", "Ensure meta descriptions are at least 60 characters long"),
    ContentCheck("empty-heading", "Ensure headings include text", ("2.0", "A", "1.3.1"), "Structure"),
    ContentCheck("pdf_no_headings", "Specify headings for every PDF", ("2.0", "A", "1.3.1"), "Documents"),
    ContentCheck("pdf_no_language", "Ensure PDFs specify a default language", ("2.0", "A", "3.1.1"), "Documents"),
    ContentCheck("identical-links-same-purpose", "Avoid using the same link text for different destinations", ("2.0", "A", "2.4.4"), "Links"),
    ContentCheck("texas_senate_bill_17", "Texas Senate Bill 17"),
    ContentCheck("find_accessibility", 'Find "accessibility"'),
    ContentCheck("pdf_heading_order", "Ensure PDF headings follow a logical order", ("2.0", "A", "1.3.1"), "Documents"),
    ContentCheck("eeo_terms", "Identify Pages using EEO terms"),
    ContentCheck("affirmative_action", "Identify Pages using Affirmative Action terms"),
    ContentCheck("multiple_h1", "Avoid more than one H1 header per page", None, "Structure"),
    ContentCheck("link_no_text", "Ensure links contain text", None, "Links"),
    ContentCheck("pdf_no_bookmarks", "Ensure long PDFs use bookmarks to aid navigation", ("2.0", "AA", "2.4.5"), "Documents"),
)

CONTENT_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in CONTENT_CHECKS)
CONTENT_CHECK_BY_ID: dict[str, ContentCheck] = {c.rule_id: c for c in CONTENT_CHECKS}


def content_rank(rule_id: str) -> int:
    """Position in the presented order; unlisted ids sort last."""
    try:
        return CONTENT_CHECK_ORDER.index(rule_id)
    except ValueError:
        return len(CONTENT_CHECK_ORDER)


def wcag_criterion_text(check: ContentCheck) -> str | None:
    """The catalog's 'WCAG 2.0 A 2.4.4' form, or None for non-WCAG checks."""
    if check.criterion is None:
        return None
    version, level, criterion = check.criterion
    return f"WCAG {version} {level} {criterion}"
