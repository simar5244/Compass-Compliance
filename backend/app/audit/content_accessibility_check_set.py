"""Content accessibility: the accessibility work a content editor can do.

A filtered view over Content — it deliberately leaves out the technical checks
(contrast ratios, ARIA wiring, keyboard behaviour) that belong to a developer,
and keeps the ones an author fixes by editing words, links, images and PDFs.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck

ContentAccessibilityCheck = ModuleCheck

CONTENT_ACCESSIBILITY_CHECKS: tuple[ContentAccessibilityCheck, ...] = (
    ModuleCheck("link_purpose_unclear", "Ensure links explain their purpose", ("2.0", "A", "2.4.4"), "Links"),
    ModuleCheck("pdf_contrast", "Check PDFs have sufficient text contrast", ("2.0", "A", "1.4.3"), "Documents"),
    ModuleCheck("page-title", "Check that each page has an appropriate title", ("2.0", "A", "2.4.2"), "Structure"),
    ModuleCheck("pdf_reading_order", "Ensure PDF content is in a meaningful sequence", ("2.0", "A", "1.3.2"), "Documents"),
    ModuleCheck("image-alt-content", "Ensure alternative text is appropriate", ("2.0", "A", "1.1.1"), "Images"),
    ModuleCheck("new_tab_disclosure", "Ensure links explain they open in a new tab", ("2.0", "AAA", "3.2.5"), "Links"),
    ModuleCheck("pdf_not_tagged", "Tag all PDFs", ("2.0", "A", "1.3.1"), "Documents"),
    ModuleCheck("page-has-heading-one", "Ensure every page contains a top-level heading", ("2.0", "A", "1.3.1"), "Structure"),
    ModuleCheck("pdf_no_title", "Ensure PDFs have a title", ("2.0", "A", "2.4.2"), "Documents"),
    ModuleCheck("reading_level_aaa", "Ensure content is not too difficult to understand", ("2.0", "AAA", "3.1.5"), "Writing"),
    ModuleCheck("image-redundant-alt", "Avoid alternative text that is the same as adjacent text", ("2.0", "A", "1.1.1"), "Images"),
    ModuleCheck("decorative_images_review", "Check images have been correctly defined as decorative", ("2.0", "A", "1.1.1"), "Images"),
    ModuleCheck("empty-heading", "Ensure headings include text", ("2.0", "A", "1.3.1"), "Structure"),
    ModuleCheck("pdf_no_headings", "Specify headings for every PDF", ("2.0", "A", "1.3.1"), "Documents"),
    ModuleCheck("pdf_no_language", "Ensure PDFs specify a default language", ("2.0", "A", "3.1.1"), "Documents"),
    ModuleCheck("identical-links-same-purpose", "Avoid using the same link text for different destinations", ("2.0", "A", "2.4.4"), "Links"),
    ModuleCheck("pdf_heading_order", "Ensure PDF headings follow a logical order", ("2.0", "A", "1.3.1"), "Documents"),
    ModuleCheck("pdf_no_bookmarks", "Ensure long PDFs use bookmarks to aid navigation", ("2.0", "AA", "2.4.5"), "Documents"),
    ModuleCheck("text_conveys_information", "Use text to convey information where possible", ("2.0", "AA", "1.4.5"), "Writing"),
    ModuleCheck("headings_labels_descriptive", "Check that headings and labels are descriptive", ("2.0", "AA", "2.4.6"), "Structure"),
    ModuleCheck("field_instructions", "Ensure instructions are provided for appropriate fields", ("2.0", "A", "3.3.2"), "Forms"),
    ModuleCheck("frame-title", "Check that each frame has an appropriate title", ("2.0", "A", "2.4.1"), "Structure"),
    ModuleCheck("context_sensitive_help", "Check context-sensitive help is available for forms", ("2.0", "AAA", "3.3.5"), "Forms"),
)

CONTENT_ACCESSIBILITY_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in CONTENT_ACCESSIBILITY_CHECKS)
