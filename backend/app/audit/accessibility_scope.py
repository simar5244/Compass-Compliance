"""The six Accessibility checks exposed by the Inspector.

axe emits many narrowly-scoped rule ids.  The product UI presents those
findings as six check-level rows, so this module consolidates supported axe
evidence and removes accessibility checks outside the configured set.
"""

from __future__ import annotations


ACCESSIBILITY_RULE_ORDER = (
    "keyboard_functionality",
    "lists_markup",
    "broken_anchor_links",
    "consistent_help",
    "page_title_accessibility",
    "meaningful_sequence",
    "alt_text_appropriate",
    "redundant_entry",
    "drag_alternative",
    "inactivity_data_loss",
    "pause_animated_content",
    "unusual_words_definitions",
    "decorative_images_accessibility",
    "text_should_be_heading",
    "new_tab_accessibility",
    "visual_presentation_text",
    "interruptions_suppressible",
    "large_interactive_controls",
    "very_high_contrast",
    "consistent_navigation",
    "abbreviations_meaning",
    "descriptive_headings_labels",
    "images_of_text",
    "timing_not_essential",
    "custom_tab_order",
    "three_flashes_a",
    "flashing_content_aaa",
    "consistent_identification",
    "text_conveys_information_accessibility",
    "multiple_ways",
)

MARKETING_INSPECTOR_ALIAS_RULES = (
    "marketing_lists_semantic",
    "marketing_alt_text",
    "marketing_readability",
    "marketing_meta_description",
    "marketing_headings_review",
)

PRIVACY_POLICY_INSPECTOR_ALIAS_RULES = (
    "technology_privacy",
    "privacy_cookies_review",
    "cookies_information",
    "policies_sensitive_keywords",
)

INSPECTOR_ONLY_ALIAS_RULES = frozenset((
    *ACCESSIBILITY_RULE_ORDER, *MARKETING_INSPECTOR_ALIAS_RULES,
    *PRIVACY_POLICY_INSPECTOR_ALIAS_RULES,
))

_RULE_MAP = {
    # Keyboard-operable functionality and focus behavior.
    "aria-hidden-focus": "keyboard_functionality",
    "frame-focusable-content": "keyboard_functionality",
    "nested-interactive": "keyboard_functionality",
    "focus-visible": "keyboard_functionality",
    "keyboard_functionality": "keyboard_functionality",
    # Semantic list structure.
    "definition-list": "lists_markup",
    "dlitem": "lists_markup",
    "list": "lists_markup",
    "listitem": "lists_markup",
    "lists_markup": "lists_markup",
    # Page title (axe plus our broader title-quality check).
    "document-title": "page_title_accessibility",
    "page_title_accessibility": "page_title_accessibility",
    "broken_anchor_links": "broken_anchor_links",
    "consistent_help": "consistent_help",
    "meaningful_sequence": "meaningful_sequence",
    "alt_text_appropriate": "alt_text_appropriate",
    "redundant_entry": "redundant_entry",
    "drag_alternative": "drag_alternative",
    "inactivity_data_loss": "inactivity_data_loss",
    "pause_animated_content": "pause_animated_content",
    "unusual_words_definitions": "unusual_words_definitions",
    "decorative_images_accessibility": "decorative_images_accessibility",
    "text_should_be_heading": "text_should_be_heading",
    "new_tab_accessibility": "new_tab_accessibility",
    "visual_presentation_text": "visual_presentation_text",
    "interruptions_suppressible": "interruptions_suppressible",
    "large_interactive_controls": "large_interactive_controls",
    "very_high_contrast": "very_high_contrast",
    "consistent_navigation": "consistent_navigation",
    "abbreviations_meaning": "abbreviations_meaning",
    "descriptive_headings_labels": "descriptive_headings_labels",
    "images_of_text": "images_of_text",
    "timing_not_essential": "timing_not_essential",
    "custom_tab_order": "custom_tab_order",
    "three_flashes_a": "three_flashes_a",
    "flashing_content_aaa": "flashing_content_aaa",
    "consistent_identification": "consistent_identification",
    "text_conveys_information_accessibility": "text_conveys_information_accessibility",
    "multiple_ways": "multiple_ways",
    "area-alt": "alt_text_appropriate",
    "image-alt": "alt_text_appropriate",
    "image-redundant-alt": "alt_text_appropriate",
    "input-image-alt": "alt_text_appropriate",
    "object-alt": "alt_text_appropriate",
    "meta-refresh": "inactivity_data_loss",
    "meta-refresh-no-exceptions": "inactivity_data_loss",
    "blink": "pause_animated_content",
    "marquee": "pause_animated_content",
    "no-autoplay-audio": "pause_animated_content",
    "p-as-heading": "text_should_be_heading",
    "target-size": "large_interactive_controls",
    "color-contrast-enhanced": "very_high_contrast",
    "accesskeys": "custom_tab_order",
    "focus-order-semantics": "custom_tab_order",
    "identical-links-same-purpose": "consistent_identification",
}

_WCAG = {
    "keyboard_functionality": ("2.0", "A", "2.1.1", "Keyboard"),
    "lists_markup": ("2.0", "A", "1.3.1", "Info and Relationships"),
    "broken_anchor_links": (None, None, None, None),
    "consistent_help": ("2.2", "A", "3.2.6", "Consistent Help"),
    "page_title_accessibility": ("2.0", "A", "2.4.2", "Page Titled"),
    "meaningful_sequence": ("2.0", "A", "1.3.2", "Meaningful Sequence"),
    "alt_text_appropriate": ("2.0", "A", "1.1.1", "Non-text Content"),
    "redundant_entry": ("2.2", "A", "3.3.7", "Redundant Entry"),
    "drag_alternative": ("2.2", "AA", "2.5.7", "Dragging Movements"),
    "inactivity_data_loss": ("2.1", "AAA", "2.2.6", "Timeouts"),
    "pause_animated_content": ("2.0", "A", "2.2.2", "Pause, Stop, Hide"),
    "unusual_words_definitions": ("2.0", "AAA", "3.1.3", "Unusual Words"),
    "decorative_images_accessibility": ("2.0", "A", "1.1.1", "Non-text Content"),
    "text_should_be_heading": ("2.0", "A", "1.3.1", "Info and Relationships"),
    "new_tab_accessibility": ("2.0", "A", "3.2.1", "On Focus"),
    "visual_presentation_text": ("2.0", "AAA", "1.4.8", "Visual Presentation"),
    "interruptions_suppressible": ("2.0", "AAA", "2.2.4", "Interruptions"),
    "large_interactive_controls": ("2.2", "AAA", "2.5.5", "Target Size (Enhanced)"),
    "very_high_contrast": ("2.0", "AAA", "1.4.6", "Contrast (Enhanced)"),
    "consistent_navigation": ("2.0", "AA", "3.2.3", "Consistent Navigation"),
    "abbreviations_meaning": ("2.0", "AAA", "3.1.4", "Abbreviations"),
    "descriptive_headings_labels": ("2.0", "AA", "2.4.6", "Headings and Labels"),
    "images_of_text": ("2.0", "AAA", "1.4.9", "Images of Text (No Exception)"),
    "timing_not_essential": ("2.0", "AAA", "2.2.3", "No Timing"),
    "custom_tab_order": ("2.0", "A", "2.4.3", "Focus Order"),
    "three_flashes_a": ("2.0", "A", "2.3.1", "Three Flashes or Below Threshold"),
    "flashing_content_aaa": ("2.0", "AAA", "2.3.2", "Three Flashes"),
    "consistent_identification": ("2.0", "AA", "3.2.4", "Consistent Identification"),
    "text_conveys_information_accessibility": ("2.0", "A", "1.3.3", "Sensory Characteristics"),
    "multiple_ways": ("2.0", "AA", "2.4.5", "Multiple Ways"),
}


def scope_accessibility_records(records: list[dict]) -> list[dict]:
    """Consolidate supported evidence and discard all other a11y rows."""
    scoped: list[dict] = []
    for record in records:
        if record.get("category") != "accessibility":
            scoped.append(record)
            continue
        target = _RULE_MAP.get(record.get("rule_id"))
        if target is None:
            continue
        normalized = dict(record)
        normalized["rule_id"] = target
        version, level, criterion_id, criterion_name = _WCAG[target]
        normalized.update(
            wcag_version=version,
            wcag_level=level,
            criterion_id=criterion_id,
            criterion_name=criterion_name,
        )
        scoped.append(normalized)
    return scoped


_INSPECTOR_ALIASES = {
    "image-alt-content": (("alt_text_appropriate", "accessibility"), ("marketing_alt_text", "marketing")),
    "decorative_images_review": (("decorative_images_accessibility", "accessibility"),),
    "new_tab_disclosure": (("new_tab_accessibility", "accessibility"),),
    "headings_labels_descriptive": (("descriptive_headings_labels", "accessibility"),),
    "text_conveys_information": (("text_conveys_information_accessibility", "accessibility"),),
    "readability": (("marketing_readability", "marketing"),),
    "meta_description_too_short": (("marketing_meta_description", "marketing"),),
    "headings_review": (("marketing_headings_review", "marketing"),),
    "list": (("marketing_lists_semantic", "marketing"),),
    "listitem": (("marketing_lists_semantic", "marketing"),),
    "definition-list": (("marketing_lists_semantic", "marketing"),),
    "dlitem": (("marketing_lists_semantic", "marketing"),),
    "technology": (("technology_privacy", "privacy"),),
    "sensitive_keywords": (("policies_sensitive_keywords", "policies"),),
}


def add_inspector_accessibility_aliases(records: list[dict]) -> list[dict]:
    """Copy shared Content evidence into Inspector-only Accessibility checks."""
    additions = []
    for record in records:
        targets = _INSPECTOR_ALIASES.get(record.get("rule_id"))
        if not targets:
            continue
        for target, category in targets:
            alias = dict(record)
            alias["rule_id"] = target
            alias["category"] = category
            alias["subcategory"] = "WCAG" if category == "accessibility" else (
                "Content optimization" if category == "marketing" else "Policy review"
            )
            if category == "accessibility":
                version, level, criterion_id, criterion_name = _WCAG[target]
                alias.update(
                    wcag_version=version, wcag_level=level,
                    criterion_id=criterion_id, criterion_name=criterion_name,
                )
            additions.append(alias)
    return records + additions
