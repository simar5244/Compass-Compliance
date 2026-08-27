"""Static catalogue of checks shown in the platform UI.

The catalogue is intentionally independent from the latest scan: a passing
check is still useful information and must remain visible to site owners.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.audit.module_check_sets import (
    listed_criterion_text,
    listed_display_name,
    module_rule_ids_in_order,
)


@dataclass(frozen=True)
class CheckCatalogEntry:
    rule_id: str
    display_name: str
    category: str
    subcategory: str
    wcag_criterion: str | None
    severity: str
    assisted: bool
    description: str


_AXE_RULE_IDS = """
error-occurred accesskeys area-alt aria-allowed-attr aria-allowed-role aria-braille-equivalent
aria-command-name aria-conditional-attr aria-deprecated-role aria-dialog-name aria-hidden-body
aria-hidden-focus aria-input-field-name aria-meter-name aria-progressbar-name aria-prohibited-attr
aria-required-attr aria-required-children aria-required-parent aria-roledescription aria-roles
aria-tab-name aria-text aria-toggle-field-name aria-tooltip-name aria-treeitem-name aria-valid-attr-value
aria-valid-attr audio-caption autocomplete-valid avoid-inline-spacing blink button-name bypass
color-contrast-enhanced color-contrast css-orientation-lock definition-list dlitem document-title
duplicate-id-active duplicate-id-aria duplicate-id empty-heading empty-table-header focus-order-semantics
form-field-multiple-labels frame-focusable-content frame-tested frame-title-unique frame-title
heading-order hidden-content html-has-lang html-lang-valid html-xml-lang-mismatch identical-links-same-purpose
image-alt image-redundant-alt input-button-name input-image-alt label-content-name-mismatch label-title-only
label landmark-banner-is-top-level landmark-complementary-is-top-level landmark-contentinfo-is-top-level
landmark-main-is-top-level landmark-no-duplicate-banner landmark-no-duplicate-contentinfo
landmark-no-duplicate-main landmark-one-main landmark-unique link-in-text-block link-name list listitem
marquee meta-refresh-no-exceptions meta-refresh meta-viewport-large meta-viewport nested-interactive
no-autoplay-audio object-alt p-as-heading page-has-heading-one presentation-role-conflict
""".split()[:75]

_LIGHTHOUSE_RULE_IDS = """
render_blocking_resources unused_javascript unused_css excessive_dom_size legacy_javascript
third_party_impact total_page_weight long_main_thread_tasks cache_ttl font_display unminified_css
unminified_javascript preconnect_missing high_rtt js_execution_time defer_offscreen_images
image_modern_format image_resolution image_optimization passive_event_listeners time_to_interactive
missing_js_files missing_css_files
""".split()

_CUSTOM_RULE_IDS = """
readability page-title image-alt-content
csp_missing cookie_ssl privacy_enhanced server_response_time hsts privacy-policy-link cookie-consent trackers
cookies_review phone_numbers_exposed email_addresses_exposed forms_inventory headings_review network_requests_review
technology_privacy cookie_disclaimer form_data_review sensitive_keywords texas_senate_bill_17 find_accessibility
eeo_terms affirmative_action sitemap_missing sitemap_malformed page_missing_from_sitemap
meta_description_too_short placeholder_links decorative_images_review new_tab_disclosure
headings_labels_descriptive text_conveys_information
keyboard_functionality lists_markup broken_anchor_links consistent_help page_title_accessibility meaningful_sequence
alt_text_appropriate redundant_entry drag_alternative inactivity_data_loss pause_animated_content
unusual_words_definitions decorative_images_accessibility text_should_be_heading new_tab_accessibility
visual_presentation_text interruptions_suppressible large_interactive_controls very_high_contrast
consistent_navigation abbreviations_meaning descriptive_headings_labels images_of_text timing_not_essential
custom_tab_order three_flashes_a flashing_content_aaa consistent_identification
text_conveys_information_accessibility multiple_ways
marketing_lists_semantic structured_data_missing marketing_alt_text marketing_readability
marketing_meta_description marketing_headings_review javascript_errors favicon_review javascript_logs
cookie-consent privacy_cookies_review cookies_information policy-privacy policy-cookie policies_sensitive_keywords
accessibility_statement_present accessibility_statement_contact alternative_format_process
sb17_context_aware ferpa_student_id_exposure ferpa_grade_exposure ferpa_directory_info
emergency_info_linked emergency_contact_present stale_content outdated_year_reference former_staff_reference
brand_unapproved_colors brand_unapproved_fonts brand_logo_present brand_button_consistency brand_cms_detected
""".split()

assert len(_AXE_RULE_IDS) + len(_LIGHTHOUSE_RULE_IDS) + len(_CUSTOM_RULE_IDS) == 194

_LIGHTHOUSE_SET = set(_LIGHTHOUSE_RULE_IDS)
LIGHTHOUSE_RULE_IDS = frozenset(_LIGHTHOUSE_RULE_IDS)
_POLICY_SET = {
    "sensitive_keywords", "forms_inventory", "headings_review", "network_requests_review", "texas_senate_bill_17",
    "find_accessibility", "eeo_terms", "affirmative_action", "policy-privacy", "policy-cookie",
    "policies_sensitive_keywords",
}
_TTU_COMPLIANCE_SET = {
    "accessibility_statement_present", "accessibility_statement_contact", "alternative_format_process",
    "sb17_context_aware", "ferpa_student_id_exposure", "ferpa_grade_exposure", "ferpa_directory_info",
    "emergency_info_linked", "emergency_contact_present", "stale_content", "outdated_year_reference", "former_staff_reference",
}
_BRAND_STANDARDS_SET = {"brand_unapproved_colors", "brand_unapproved_fonts", "brand_logo_present", "brand_button_consistency", "brand_cms_detected"}
_PRIVACY_SET = {
    "csp_missing", "cookie_ssl", "privacy_enhanced", "hsts", "privacy-policy-link",
    "cookies_review", "cookie_disclaimer", "cookie-consent", "privacy_cookies_review", "cookies_information",
    "form_data_review", "phone_numbers_exposed", "email_addresses_exposed", "technology_privacy",
}
_MARKETING_INSPECTOR_SET = {
    "marketing_lists_semantic", "structured_data_missing", "marketing_alt_text",
    "marketing_readability", "marketing_meta_description", "marketing_headings_review",
}
_UX_INSPECTOR_SET = {"javascript_errors", "favicon_review", "javascript_logs"}
_CUSTOM_NAMES = {
    "broken-links": "Check and fix broken links",
    "sensitive_keywords": "Sensitive keywords",
    "page-title": "Check that each page has an appropriate title",
    "image-alt-content": "Ensure alternative text is appropriate",
    "readability": "Consider making text easier to understand",
    "meta_description_too_short": "Ensure meta descriptions are at least 60 characters long",
    "placeholder_links": "Check placeholder links work as expected",
    "decorative_images_review": "Check images have been correctly defined as decorative",
    "new_tab_disclosure": "Ensure links explain they open in a new tab",
    "headings_labels_descriptive": "Check that headings and labels are descriptive",
    "text_conveys_information": "Use text to convey information where possible",
    "headings_review": "Review headings on this website",
    "keyboard_functionality": "Ensure functionality is available to keyboard users",
    "lists_markup": "Ensure lists are marked up correctly",
    "broken_anchor_links": "Avoid linking to anchors that do not exist",
    "consistent_help": "Ensure help is presented consistently",
    "page_title_accessibility": "Check that each page has an appropriate title",
    "meaningful_sequence": "Ensure HTML is in a meaningful sequence",
    "alt_text_appropriate": "Ensure alternative text is appropriate",
    "redundant_entry": "Avoid redundant entry",
    "drag_alternative": "Ensure drag and drop movements have an accessible alternative",
    "inactivity_data_loss": "Ensure pages with inactivity time limits do not cause data loss",
    "pause_animated_content": "Ensure users can pause or hide animated content",
    "unusual_words_definitions": "Ensure users can find definitions of unusual words",
    "decorative_images_accessibility": "Check images have been correctly defined as decorative",
    "text_should_be_heading": "Check if text should be marked as a heading",
    "new_tab_accessibility": "Ensure links explain they open in a new tab",
    "visual_presentation_text": "Ensure users can control the visual presentation of text",
    "interruptions_suppressible": "Ensure pages with interruptions can be postponed or suppressed by the user",
    "large_interactive_controls": "Aim for large interactive controls",
    "very_high_contrast": "Aim for text to have very high contrast (AAA)",
    "consistent_navigation": "Ensure that navigation remains consistent",
    "abbreviations_meaning": "Ensure users can identify the meaning of abbreviations",
    "descriptive_headings_labels": "Check that headings and labels are descriptive",
    "images_of_text": "Ensure images of text are decorative only",
    "timing_not_essential": "Ensure timing is not an essential part of an event or activity presented by the content",
    "custom_tab_order": "Ensure custom tabbing order makes sense",
    "three_flashes_a": "Check pages for three flashes (Level A)",
    "flashing_content_aaa": "Check pages for flashing content (Level AAA)",
    "consistent_identification": "Ensure components are identified consistently",
    "text_conveys_information_accessibility": "Use text to convey information where possible",
    "multiple_ways": "Ensure there are multiple ways to access a page",
    "marketing_lists_semantic": "Write lists or groups of links semantically",
    "structured_data_missing": "Consider using structured data",
    "marketing_alt_text": "Ensure alternative text is appropriate",
    "marketing_readability": "Consider making text easier to understand",
    "marketing_meta_description": "Ensure meta descriptions are at least 60 characters long",
    "marketing_headings_review": "Review headings on this website",
    "javascript_errors": "Fix JavaScript errors",
    "favicon_review": "Review unapproved Favicons",
    "javascript_logs": "Review JavaScript log messages",
    "cookie-consent": "Add a cookie disclaimer to every page",
    "privacy_cookies_review": "Review cookies and add to privacy policy",
    "cookies_information": "Cookies",
    "policy-privacy": "Link every page to a privacy policy",
    "policy-cookie": "Add a cookie disclaimer to every page",
    "policies_sensitive_keywords": "Sensitive keywords",
    "meta-description": "Meta descriptions",
    "heading-order-content": "Heading order",
    "server_response_time": "Server response time", "privacy-policy-link": "Privacy policy link",
    "page_missing_from_sitemap": "Pages missing from sitemap",
    "accessibility_statement_present": "Link to accessibility statement from every page",
    "accessibility_statement_contact": "Accessibility statement includes contact information",
    "alternative_format_process": "Alternative format request process is clear",
    "sb17_context_aware": "Senate Bill 17 — context-aware policy detection",
    "ferpa_student_id_exposure": "Potential student ID number exposure",
    "ferpa_grade_exposure": "Potential grade or academic record exposure",
    "ferpa_directory_info": "Review publicly visible directory information",
    "emergency_info_linked": "Link to TTU emergency procedures from every page",
    "emergency_contact_present": "Emergency contact numbers accessible",
    "stale_content": "Page content may be outdated",
    "outdated_year_reference": "Outdated year references detected",
    "former_staff_reference": "Review staff/faculty references for accuracy",
    "brand_unapproved_colors": "Unapproved brand colors detected",
    "brand_unapproved_fonts": "Unapproved font families detected",
    "brand_logo_present": "TTU logo must appear on every page",
    "brand_button_consistency": "Button styles should match TTU design system",
    "brand_cms_detected": "CMS detected — brand fixes available with specific instructions",
}

_CUSTOM_DESCRIPTIONS = {
    "sensitive_keywords": "Review sensitive keyword matches in their page context.",
    "page-title": "Give every page a concise, unique title that accurately describes its topic or purpose.",
    "image-alt-content": "Use concise alternative text for meaningful images and empty alt text only for decorative images.",
    "readability": "Shorten sentences and use familiar words where doing so preserves the meaning.",
    "meta_description_too_short": "Write an accurate meta description containing at least 60 characters.",
    "placeholder_links": "Replace placeholder destinations with working links or use buttons for actions.",
    "decorative_images_review": "Confirm images marked as decorative convey no meaningful information.",
    "new_tab_disclosure": "Warn users when a link opens a new browser tab or window.",
    "headings_labels_descriptive": "Ensure headings and labels clearly describe the content or control they introduce.",
    "text_conveys_information": "Provide text for information otherwise communicated only through sensory characteristics.",
    "headings_review": "Review the page heading outline for clarity, accuracy, and logical organization.",
    "keyboard_functionality": "Use native interactive controls and make all functionality operable using a keyboard.",
    "lists_markup": "Use list elements and list-item semantics so relationships are available to assistive technology.",
    "broken_anchor_links": "Point in-page links to an id or named anchor that exists on the page.",
    "consistent_help": "Keep repeated help mechanisms in a consistent relative order across pages.",
    "page_title_accessibility": "Give every page a concise, unique title that describes its topic or purpose.",
    "meaningful_sequence": "Keep the DOM in a meaningful reading order when presentation changes its visual layout.",
    "alt_text_appropriate": "Provide concise, meaningful alternatives for informative images and omit redundant wording.",
    "redundant_entry": "Reuse information already supplied in the same process or let users select it.",
    "drag_alternative": "Provide a single-pointer alternative for every action that requires dragging.",
    "inactivity_data_loss": "Warn users about inactivity timeouts and preserve their entered data.",
    "pause_animated_content": "Provide controls to pause, stop, or hide moving or auto-updating content.",
    "unusual_words_definitions": "Provide definitions for idioms, jargon, and unusual words.",
    "decorative_images_accessibility": "Use empty alternative text or presentation semantics only for truly decorative images.",
    "text_should_be_heading": "Use semantic heading elements for text that visually and structurally introduces a section.",
    "new_tab_accessibility": "Warn users before a link opens a new tab or window.",
    "visual_presentation_text": "Allow users to adjust colors, width, alignment, spacing, and text size without loss of content.",
    "interruptions_suppressible": "Allow non-emergency interruptions to be postponed or suppressed.",
    "large_interactive_controls": "Make pointer targets at least 44 by 44 CSS pixels where possible.",
    "very_high_contrast": "Use at least 7:1 contrast for normal text and 4.5:1 for large text.",
    "consistent_navigation": "Keep repeated navigation mechanisms in the same relative order across pages.",
    "abbreviations_meaning": "Expand abbreviations on first use or provide their meaning programmatically.",
    "descriptive_headings_labels": "Make headings and labels describe their topic or purpose.",
    "images_of_text": "Use real text instead of images of text except where the image is purely decorative.",
    "timing_not_essential": "Provide an untimed alternative when timing is not essential.",
    "custom_tab_order": "Ensure custom focus order follows a logical and operable sequence.",
    "three_flashes_a": "Ensure content does not flash more than three times per second or exceed thresholds.",
    "flashing_content_aaa": "Ensure content never flashes more than three times in any one-second period.",
    "consistent_identification": "Identify components with the same functionality consistently across pages.",
    "text_conveys_information_accessibility": "Do not rely only on shape, color, size, visual location, orientation, or sound.",
    "multiple_ways": "Provide at least two ways to locate pages within a set of pages.",
    "marketing_lists_semantic": "Use semantic list markup for lists and groups of related links.",
    "structured_data_missing": "Add appropriate schema.org structured data where it helps search engines understand the page.",
    "marketing_alt_text": "Use concise alternative text that accurately represents meaningful images.",
    "marketing_readability": "Use clear, familiar language and manageable sentence length.",
    "marketing_meta_description": "Write an accurate meta description containing at least 60 characters.",
    "marketing_headings_review": "Review the heading outline for clear organization and useful page structure.",
    "javascript_errors": "Fix uncaught JavaScript errors that can break page behavior.",
    "favicon_review": "Confirm the page uses an approved favicon that matches the organization’s brand.",
    "javascript_logs": "Review console log, warning, info, and debug messages and remove unintended output.",
    "cookie-consent": "Add an appropriate cookie notice or consent mechanism to every page.",
    "privacy_cookies_review": "Review detected cookies and document their name, purpose, duration, and provider.",
    "cookies_information": "Inventory the cookies observed while rendering this page.",
    "policy-privacy": "Link every page to the website’s privacy policy.",
    "policy-cookie": "Add a cookie policy or disclaimer to every page where applicable.",
    "policies_sensitive_keywords": "Review sensitive keyword matches in their page context.",
    "accessibility_statement_present": "Texas Administrative Code requires all state agency and public university websites to include a link to an accessibility statement on every page. The statement must include contact information for requesting alternative formats.",
    "accessibility_statement_contact": "The accessibility statement must include a name, phone number, or email address for users to request alternative formats or report accessibility barriers.",
    "alternative_format_process": "Texas higher education institutions must provide a clear process for students to request content in alternative formats (large print, audio, braille, etc.).",
    "sb17_context_aware": "Texas Senate Bill 17 (2023) restricts DEI offices and programs at public universities. Pages containing certain language should be reviewed to ensure compliance. This check distinguishes between educational content about diversity (generally acceptable) and operational DEI program descriptions (requires legal review).",
    "ferpa_student_id_exposure": "FERPA prohibits public display of student education records including student ID numbers. TTU student IDs follow the pattern R + 8 digits (e.g. R12345678).",
    "ferpa_grade_exposure": "Pages that appear to display individual student grades or academic records publicly may violate FERPA. These pages should be behind authentication.",
    "ferpa_directory_info": "FERPA allows institutions to designate certain information as directory information (name, major, enrollment status). However, students may opt out of directory information disclosure. Review pages that list student names alongside academic information.",
    "emergency_info_linked": "Texas universities must make emergency procedures readily accessible. Every page should link to TTU's emergency information resources.",
    "emergency_contact_present": "TTU Police (806-742-3931) and campus emergency contacts should be accessible from every page or clearly linked.",
    "stale_content": "Pages that have not been updated in over 12 months may contain outdated information. Review and update or archive.",
    "outdated_year_reference": "Page contains references to past years that may indicate outdated content (e.g. 'Fall 2022 semester', 'Spring 2023 enrollment').",
    "former_staff_reference": "Pages listing staff or faculty names should be reviewed periodically to ensure listed individuals are still current. This is an assisted check requiring human verification.",
    "brand_unapproved_colors": "TTU brand standards specify approved colors. Prominent elements (headers, buttons, navigation) using unapproved colors should be reviewed.",
    "brand_unapproved_fonts": "TTU brand standards specify approved font families. Headings and body text should use approved fonts only.",
    "brand_logo_present": "Every TTU web page must display the official Texas Tech University logo or wordmark.",
    "brand_button_consistency": "Primary buttons should use Matador Red (#CC0000) background. Secondary buttons should use outlined style with dark border. Review buttons using other color schemes.",
    "brand_cms_detected": "A content management system was detected on this page. Brand compliance fixes can be made directly in the CMS without editing code.",
}

_CONTENT_RULE_IDS = frozenset({
    "sensitive_keywords", "page-title", "image-alt-content", "readability",
    "meta_description_too_short", "placeholder_links", "decorative_images_review",
    "new_tab_disclosure", "headings_labels_descriptive", "text_conveys_information",
    "headings_review",
})


def _display_name(rule_id: str) -> str:
    listed = listed_display_name(rule_id)
    if listed is not None:
        return listed
    return _CUSTOM_NAMES.get(rule_id, rule_id.replace("-", " ").replace("_", " ").title())


def _category(rule_id: str) -> tuple[str, str]:
    if rule_id in _TTU_COMPLIANCE_SET:
        return "TTU Compliance", {
            "accessibility_statement_present": "ADA / Section 508", "accessibility_statement_contact": "ADA / Section 508", "alternative_format_process": "ADA / Section 508",
            "sb17_context_aware": "Senate Bill 17", "ferpa_student_id_exposure": "FERPA", "ferpa_grade_exposure": "FERPA", "ferpa_directory_info": "FERPA",
            "emergency_info_linked": "Emergency Info", "emergency_contact_present": "Emergency Info", "stale_content": "Content Health", "outdated_year_reference": "Content Health", "former_staff_reference": "Content Health",
        }[rule_id]
    if rule_id in _BRAND_STANDARDS_SET:
        return "Brand Standards", {"brand_unapproved_colors": "Colors", "brand_unapproved_fonts": "Typography", "brand_logo_present": "Logo Usage", "brand_button_consistency": "Buttons & Components", "brand_cms_detected": "CMS Integration"}[rule_id]
    if rule_id in _MARKETING_INSPECTOR_SET:
        return "marketing", "Content optimization"
    if rule_id in _UX_INSPECTOR_SET:
        return "ux", "Functionality"
    if rule_id in _CONTENT_RULE_IDS:
        if rule_id in {"image-alt-content", "decorative_images_review"}:
            return "content", "Images"
        if rule_id in {"placeholder_links", "new_tab_disclosure"}:
            return "content", "Links"
        if rule_id in {"headings_labels_descriptive", "headings_review"}:
            return "content", "Structure"
        return "content", "Writing"
    if rule_id in _LIGHTHOUSE_SET:
        return "ux", "Web Vitals"
    if rule_id in _POLICY_SET:
        return "policies", "Policy review"
    if rule_id in _PRIVACY_SET:
        if rule_id in {"cookies_review", "cookie_disclaimer"}:
            return "privacy", "Consent"
        if rule_id in {"hsts", "csp_missing", "cookie_ssl", "privacy_enhanced"}:
            return "privacy", "Security"
        return "privacy", "Audit"
    if rule_id in {"spelling", "grammar", "readability", "broken-links"}:
        return "content", "Writing" if rule_id in {"spelling", "grammar", "readability"} else "Links"
    if rule_id in {"page-title", "meta-description", "sitemap_missing", "sitemap_malformed", "page_missing_from_sitemap"}:
        return "marketing", "Technical optimization" if rule_id.startswith("sitemap") or rule_id.startswith("page_missing") else "SEO"
    return "accessibility", "WCAG"


def _severity(rule_id: str) -> str:
    if rule_id in {"accessibility_statement_present", "ferpa_student_id_exposure", "ferpa_grade_exposure", "brand_logo_present"}:
        return "error"
    if rule_id in {"accessibility_statement_contact", "alternative_format_process", "sb17_context_aware", "ferpa_directory_info", "emergency_info_linked", "emergency_contact_present", "stale_content", "brand_unapproved_colors", "brand_unapproved_fonts"}:
        return "warning"
    if rule_id in {"outdated_year_reference", "former_staff_reference", "brand_button_consistency", "brand_cms_detected"}:
        return "info"
    if rule_id in {"javascript_errors", "favicon_review", "structured_data_missing", "marketing_lists_semantic"}:
        return "warning"
    if rule_id in {"javascript_logs", "marketing_alt_text", "marketing_readability", "marketing_meta_description"}:
        return "info"
    if rule_id == "marketing_headings_review":
        return "manual"
    if rule_id in {"consistent_help", "meaningful_sequence"}:
        return "manual"
    if rule_id == "keyboard_functionality":
        return "error"
    if rule_id in {"broken_anchor_links", "page_title_accessibility"}:
        return "warning"
    if rule_id in {"headings_labels_descriptive", "text_conveys_information", "headings_review"}:
        return "manual"
    if rule_id == "page-title":
        return "warning"
    if rule_id in {"image-alt-content", "readability", "meta_description_too_short", "placeholder_links", "decorative_images_review", "new_tab_disclosure"}:
        return "info"
    if rule_id in {"sitemap_missing", "image-alt", "color-contrast", "button-name", "link-name"}:
        return "error"
    if rule_id in {"sitemap_malformed", "csp_missing", "cookie_ssl", "privacy_enhanced"}:
        return "warning"
    return "info"


def _criterion(rule_id: str) -> str | None:
    listed = listed_criterion_text(rule_id)
    if listed is not None:
        return listed
    common = {
        "image-alt": "WCAG 2.0 A 1.1.1", "color-contrast": "WCAG 2.0 AA 1.4.3",
        "link-name": "WCAG 2.0 A 2.4.4", "button-name": "WCAG 2.0 A 4.1.2",
        "html-has-lang": "WCAG 2.0 A 3.1.1", "document-title": "WCAG 2.0 A 2.4.2",
        "heading-order": "WCAG 2.0 A 1.3.1", "page-has-heading-one": "WCAG 2.0 A 1.3.1",
        "image-alt-content": "WCAG 2.0 A 1.1.1",
        "headings_labels_descriptive": "WCAG 2.0 AA 2.4.6",
        "text_conveys_information": "WCAG 2.0 A 1.3.3",
        "keyboard_functionality": "WCAG 2.0 A 2.1.1",
        "lists_markup": "WCAG 2.0 A 1.3.1",
        "consistent_help": "WCAG 2.2 A 3.2.6",
        "page_title_accessibility": "WCAG 2.0 A 2.4.2",
        "meaningful_sequence": "WCAG 2.0 A 1.3.2",
        "alt_text_appropriate": "WCAG 2.0 A 1.1.1",
        "redundant_entry": "WCAG 2.2 A 3.3.7",
        "drag_alternative": "WCAG 2.2 AA 2.5.7",
        "inactivity_data_loss": "WCAG 2.1 AAA 2.2.6",
        "pause_animated_content": "WCAG 2.0 A 2.2.2",
        "unusual_words_definitions": "WCAG 2.0 AAA 3.1.3",
        "decorative_images_accessibility": "WCAG 2.0 A 1.1.1",
        "text_should_be_heading": "WCAG 2.0 A 1.3.1",
        "new_tab_accessibility": "WCAG 2.0 A 3.2.1",
        "visual_presentation_text": "WCAG 2.0 AAA 1.4.8",
        "interruptions_suppressible": "WCAG 2.0 AAA 2.2.4",
        "large_interactive_controls": "WCAG 2.2 AAA 2.5.5",
        "very_high_contrast": "WCAG 2.0 AAA 1.4.6",
        "consistent_navigation": "WCAG 2.0 AA 3.2.3",
        "abbreviations_meaning": "WCAG 2.0 AAA 3.1.4",
        "descriptive_headings_labels": "WCAG 2.0 AA 2.4.6",
        "images_of_text": "WCAG 2.0 AAA 1.4.9",
        "timing_not_essential": "WCAG 2.0 AAA 2.2.3",
        "custom_tab_order": "WCAG 2.0 A 2.4.3",
        "three_flashes_a": "WCAG 2.0 A 2.3.1",
        "flashing_content_aaa": "WCAG 2.0 AAA 2.3.2",
        "consistent_identification": "WCAG 2.0 AA 3.2.4",
        "text_conveys_information_accessibility": "WCAG 2.0 A 1.3.3",
        "multiple_ways": "WCAG 2.0 AA 2.4.5",
    }
    return common.get(rule_id)


def _make(rule_id: str) -> CheckCatalogEntry:
    category, subcategory = _category(rule_id)
    assisted = (
        rule_id in _POLICY_SET
        or rule_id in {
            "decorative_images_review", "headings_labels_descriptive", "text_conveys_information", "headings_review",
            "consistent_help", "meaningful_sequence", "redundant_entry", "drag_alternative",
            "inactivity_data_loss", "pause_animated_content", "unusual_words_definitions",
            "decorative_images_accessibility", "visual_presentation_text", "interruptions_suppressible",
            "consistent_navigation", "abbreviations_meaning", "images_of_text", "timing_not_essential",
            "custom_tab_order", "three_flashes_a", "flashing_content_aaa", "consistent_identification",
            "text_conveys_information_accessibility", "multiple_ways",
            "marketing_headings_review", "favicon_review", "javascript_logs", "structured_data_missing",
            "privacy_cookies_review", "cookies_information", "technology_privacy", "form_data_review",
            "phone_numbers_exposed", "email_addresses_exposed", "cookies_review",
        }
        or rule_id == "page_missing_from_sitemap"
        or rule_id in {"accessibility_statement_contact", "alternative_format_process", "sb17_context_aware", "ferpa_student_id_exposure", "ferpa_grade_exposure", "ferpa_directory_info", "stale_content", "outdated_year_reference", "former_staff_reference", "brand_unapproved_colors", "brand_unapproved_fonts", "brand_button_consistency", "brand_cms_detected"}
    )
    return CheckCatalogEntry(
        rule_id=rule_id,
        display_name=_display_name(rule_id),
        category=category,
        subcategory=subcategory,
        wcag_criterion=_criterion(rule_id),
        severity=_severity(rule_id),
        assisted=assisted,
        description=_CUSTOM_DESCRIPTIONS.get(
            rule_id,
            f"Review { _display_name(rule_id).lower() } and apply the recommended fix where needed.",
        ),
    )


# A rule can be supplied by more than one scanner family (and legacy lists can
# repeat an id). Keep the first registration so the API never emits duplicate
# check rows, which also guarantees stable unique keys in the UI.
_CATALOGUED = list(dict.fromkeys(_AXE_RULE_IDS + _LIGHTHOUSE_RULE_IDS + _CUSTOM_RULE_IDS))
# Checks the Content module lists that no other group registers (engine-emitted
# rules such as spelling, grammar, the PDF checks and the two new writing checks).
_MODULE_ONLY_RULE_IDS = [r for r in module_rule_ids_in_order() if r not in set(_CATALOGUED)]

CHECK_CATALOG = tuple(_make(rule_id) for rule_id in (_CATALOGUED + _MODULE_ONLY_RULE_IDS))
