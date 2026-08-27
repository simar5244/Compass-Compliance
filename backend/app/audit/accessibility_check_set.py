"""The Accessibility module's check list, in the exact order it is presented.

Like the Content set, this is presentation order for a module — several entries
are produced elsewhere (the PDF checks, the two writing checks) and keep the
category that owns them. Listing a check here does not move it.
"""

from __future__ import annotations

from dataclasses import dataclass


@dataclass(frozen=True)
class AccessibilityCheck:
    rule_id: str
    display_name: str
    #: (version, level, criterion) — every accessibility check maps to a criterion.
    criterion: tuple[str, str, str]
    subcategory: str = "WCAG"


ACCESSIBILITY_CHECKS: tuple[AccessibilityCheck, ...] = (
    AccessibilityCheck("reflow", "Ensure pages don't scroll in two dimensions on small screens", ("2.1", "AA", "1.4.10"), "Mobile"),
    AccessibilityCheck("list", "Ensure lists are marked up correctly", ("2.0", "A", "4.1.1"), "Structure"),
    AccessibilityCheck("broken_anchor_links", "Avoid linking to anchors that do not exist", ("2.0", "A", "2.4.1"), "Links"),
    AccessibilityCheck("link_purpose_unclear", "Ensure links explain their purpose", ("2.0", "A", "2.4.4"), "Links"),
    AccessibilityCheck("meta-viewport", "Ensure pages don't require zooming and 2D scrolling on small screens", ("2.1", "AA", "1.4.10"), "Mobile"),
    AccessibilityCheck("focus_appearance", "Ensure controls clearly indicate when they are selected", ("2.2", "AAA", "2.4.13"), "Keyboard"),
    AccessibilityCheck("focus-visible", "Ensure controls change appearance when they are selected", ("2.0", "AA", "2.4.7"), "Keyboard"),
    AccessibilityCheck("new_tab_disclosure", "Ensure links explain they open in a new tab", ("2.0", "AAA", "3.2.5"), "Links"),
    AccessibilityCheck("pdf_not_tagged", "Tag all PDFs", ("2.0", "A", "1.3.1"), "Documents"),
    AccessibilityCheck("color-contrast", "Ensure text has sufficient contrast (AA)", ("2.0", "AA", "1.4.3"), "Contrast"),
    AccessibilityCheck("page-has-heading-one", "Ensure every page contains a top-level heading", ("2.0", "A", "1.3.1"), "Structure"),
    AccessibilityCheck("pdf_no_title", "Ensure PDFs have a title", ("2.0", "A", "2.4.2"), "Documents"),
    AccessibilityCheck("label", "Ensure form controls have labels", ("2.0", "A", "1.3.1"), "Forms"),
    AccessibilityCheck("autocomplete-valid", "Identify the purpose of fields programmatically", ("2.1", "AA", "1.3.5"), "Forms"),
    AccessibilityCheck("control_contrast", "Ensure form controls contrast sufficiently with their surroundings", ("2.1", "AA", "1.4.11"), "Forms"),
    AccessibilityCheck("reading_level_aaa", "Ensure content is not too difficult to understand", ("2.0", "AAA", "3.1.5"), "Writing"),
    AccessibilityCheck("image-redundant-alt", "Avoid alternative text that is the same as adjacent text", ("2.0", "A", "1.1.1"), "Images"),
    AccessibilityCheck("scope-attr-valid", "Add a scope to table headings", ("2.0", "A", "1.3.1"), "Tables"),
    AccessibilityCheck("empty-table-header", "Add headers to tables", ("2.0", "A", "1.3.1"), "Tables"),
    AccessibilityCheck("listitem", "Write lists or groups of links semantically", ("2.0", "A", "1.3.1"), "Structure"),
    AccessibilityCheck("empty-heading", "Ensure headings include text", ("2.0", "A", "1.3.1"), "Structure"),
    AccessibilityCheck("pdf_no_headings", "Specify headings for every PDF", ("2.0", "A", "1.3.1"), "Documents"),
    AccessibilityCheck("color-contrast-enhanced", "Aim for text to have very high contrast (AAA)", ("2.0", "AAA", "1.4.6"), "Contrast"),
    AccessibilityCheck("pdf_no_language", "Ensure PDFs specify a default language", ("2.0", "A", "3.1.1"), "Documents"),
    AccessibilityCheck("target-size", "Aim for large interactive controls", ("2.1", "AAA", "2.5.5"), "Mobile"),
    AccessibilityCheck("identical-links-same-purpose", "Avoid using the same link text for different destinations", ("2.0", "A", "2.4.4"), "Links"),
    AccessibilityCheck("fieldset_legend", "Add a legend for all fieldsets", ("2.0", "A", "1.3.1"), "Forms"),
    AccessibilityCheck("pdf_heading_order", "Ensure PDF headings follow a logical order", ("2.0", "A", "1.3.1"), "Documents"),
    AccessibilityCheck("link-name", "Ensure links can be used by screen readers", ("2.0", "A", "4.1.2"), "Links"),
    AccessibilityCheck("label_misuse", "Only use labels for appropriate form controls", ("2.0", "A", "1.3.1"), "Forms"),
    AccessibilityCheck("frame-title", "Specify a title for all frames", ("2.0", "A", "2.4.1"), "Structure"),
    AccessibilityCheck("label_orphan_for", "Ensure labels in the document point to valid IDs", ("2.0", "A", "1.3.1"), "Forms"),
    AccessibilityCheck("pdf_no_bookmarks", "Ensure long PDFs use bookmarks to aid navigation", ("2.0", "AA", "2.4.5"), "Documents"),
)

ACCESSIBILITY_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in ACCESSIBILITY_CHECKS)
ACCESSIBILITY_CHECK_BY_ID: dict[str, AccessibilityCheck] = {c.rule_id: c for c in ACCESSIBILITY_CHECKS}


def accessibility_rank(rule_id: str) -> int:
    """Position in the presented order; unlisted ids sort last."""
    try:
        return ACCESSIBILITY_CHECK_ORDER.index(rule_id)
    except ValueError:
        return len(ACCESSIBILITY_CHECK_ORDER)


def wcag_criterion_text(check: AccessibilityCheck) -> str:
    """The catalog's 'WCAG 2.0 A 2.4.4' form."""
    version, level, criterion = check.criterion
    return f"WCAG {version} {level} {criterion}"
