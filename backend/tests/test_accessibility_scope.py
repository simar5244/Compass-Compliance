from app.audit.accessibility_scope import ACCESSIBILITY_RULE_ORDER, add_inspector_accessibility_aliases, scope_accessibility_records
from app.audit.check_catalog import CHECK_CATALOG


EXPECTED_NAMES = [
    "Ensure functionality is available to keyboard users",
    "Ensure lists are marked up correctly",
    "Avoid linking to anchors that do not exist",
    "Ensure help is presented consistently",
    "Check that each page has an appropriate title",
    "Ensure HTML is in a meaningful sequence",
    "Ensure alternative text is appropriate",
    "Avoid redundant entry",
    "Ensure drag and drop movements have an accessible alternative",
    "Ensure pages with inactivity time limits do not cause data loss",
    "Ensure users can pause or hide animated content",
    "Ensure users can find definitions of unusual words",
    "Check images have been correctly defined as decorative",
    "Check if text should be marked as a heading",
    "Ensure links explain they open in a new tab",
    "Ensure users can control the visual presentation of text",
    "Ensure pages with interruptions can be postponed or suppressed by the user",
    "Aim for large interactive controls",
    "Aim for text to have very high contrast (AAA)",
    "Ensure that navigation remains consistent",
    "Ensure users can identify the meaning of abbreviations",
    "Check that headings and labels are descriptive",
    "Ensure images of text are decorative only",
    "Ensure timing is not an essential part of an event or activity presented by the content",
    "Ensure custom tabbing order makes sense",
    "Check pages for three flashes (Level A)",
    "Check pages for flashing content (Level AAA)",
    "Ensure components are identified consistently",
    "Use text to convey information where possible",
    "Ensure there are multiple ways to access a page",
]


def _record(rule_id, category="accessibility"):
    return {"rule_id": rule_id, "category": category, "criterion_id": "old"}


def test_accessibility_catalog_has_only_configured_checks_in_exact_order():
    catalog = {entry.rule_id: entry for entry in CHECK_CATALOG}
    assert [catalog[rule_id].display_name for rule_id in ACCESSIBILITY_RULE_ORDER] == EXPECTED_NAMES


def test_supported_axe_rules_are_consolidated_and_unrelated_rules_are_removed():
    records = [
        _record("aria-hidden-focus"), _record("listitem"), _record("document-title"),
        _record("color-contrast"), _record("target-size"), _record("content-rule", "content"),
    ]
    scoped = scope_accessibility_records(records)
    assert [item["rule_id"] for item in scoped] == [
        "keyboard_functionality", "lists_markup", "page_title_accessibility", "large_interactive_controls", "content-rule",
    ]
    assert scoped[0]["criterion_id"] == "2.1.1"
    assert scoped[1]["criterion_id"] == "1.3.1"
    assert scoped[2]["criterion_id"] == "2.4.2"
    assert scoped[3]["criterion_id"] == "2.5.5"


def test_all_configured_custom_rules_survive_scope():
    scoped = scope_accessibility_records([_record(rule_id) for rule_id in ACCESSIBILITY_RULE_ORDER])
    assert tuple(item["rule_id"] for item in scoped) == ACCESSIBILITY_RULE_ORDER


def test_shared_content_evidence_is_copied_for_inspector_without_removing_original():
    original = _record("new_tab_disclosure", "content")
    records = add_inspector_accessibility_aliases([original])
    assert records[0] is original
    assert records[1]["category"] == "accessibility"
    assert records[1]["rule_id"] == "new_tab_accessibility"
    assert records[1]["criterion_id"] == "3.2.1"


def test_marketing_aliases_reuse_real_findings_and_keep_originals():
    originals = [
        _record("listitem"), _record("image-alt-content", "content"),
        _record("readability", "content"), _record("meta_description_too_short", "content"),
        _record("headings_review", "content"),
    ]
    records = add_inspector_accessibility_aliases(originals)
    marketing = [item["rule_id"] for item in records if item["category"] == "marketing"]
    assert marketing == [
        "marketing_lists_semantic", "marketing_alt_text", "marketing_readability",
        "marketing_meta_description", "marketing_headings_review",
    ]
    assert records[:5] == originals


def test_privacy_and_policy_aliases_reuse_inventory_and_keyword_evidence():
    originals = [_record("technology", "inventory"), _record("sensitive_keywords", "content")]
    records = add_inspector_accessibility_aliases(originals)
    assert [(item["category"], item["rule_id"]) for item in records[2:]] == [
        ("privacy", "technology_privacy"), ("policies", "policies_sensitive_keywords"),
    ]
