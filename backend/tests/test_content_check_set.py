"""The Content module lists exactly these checks, in exactly this order."""

from app.audit.check_catalog import CHECK_CATALOG
from app.audit.content_check_set import (
    CONTENT_CHECK_ORDER,
    CONTENT_CHECKS,
    content_rank,
    wcag_criterion_text,
)
from app.audit.content_checks import (
    check_reading_level,
    check_readability,
)
from app.audit.dom_checks import check_link_purpose_unclear

EXPECTED_ORDER = [
    "Check and fix broken links",
    "Check and fix misspellings",
    "Sensitive keywords",
    "Ensure links explain their purpose",
    "Consider optimizing images",
    "Ensure links explain they open in a new tab",
    "Tag all PDFs",
    'Minimize "thin" pages',
    "Review potential grammar errors",
    "Ensure every page contains a top-level heading",
    "Ensure PDFs have a title",
    "Ensure page titles are not longer than 60 characters",
    "Ensure content is not too difficult to understand",
    "Specify meta descriptions for relevant pages",
    "Avoid alternative text that is the same as adjacent text",
    "Consider making text easier to understand",
    "Ensure meta descriptions are at least 60 characters long",
    "Ensure headings include text",
    "Specify headings for every PDF",
    "Ensure PDFs specify a default language",
    "Avoid using the same link text for different destinations",
    "Texas Senate Bill 17",
    'Find "accessibility"',
    "Ensure PDF headings follow a logical order",
    "Identify Pages using EEO terms",
    "Identify Pages using Affirmative Action terms",
    "Avoid more than one H1 header per page",
    "Ensure links contain text",
    "Ensure long PDFs use bookmarks to aid navigation",
]


def test_content_module_lists_the_requested_checks_in_order():
    assert [c.display_name for c in CONTENT_CHECKS] == EXPECTED_ORDER


def test_every_listed_check_exists_in_the_catalog():
    catalog = {entry.rule_id: entry for entry in CHECK_CATALOG}
    missing = [rid for rid in CONTENT_CHECK_ORDER if rid not in catalog]
    assert missing == [], f"listed but not catalogued: {missing}"


def test_catalog_uses_the_module_names_and_criteria():
    catalog = {entry.rule_id: entry for entry in CHECK_CATALOG}
    for check in CONTENT_CHECKS:
        entry = catalog[check.rule_id]
        assert entry.display_name == check.display_name
        assert entry.wcag_criterion == wcag_criterion_text(check)


def test_wcag_criteria_match_the_requested_labels():
    catalog = {entry.rule_id: entry for entry in CHECK_CATALOG}
    expected = {
        "link_purpose_unclear": "WCAG 2.0 A 2.4.4",
        "new_tab_disclosure": "WCAG 2.0 AAA 3.2.5",
        "pdf_not_tagged": "WCAG 2.0 A 1.3.1",
        "page-has-heading-one": "WCAG 2.0 A 1.3.1",
        "pdf_no_title": "WCAG 2.0 A 2.4.2",
        "reading_level_aaa": "WCAG 2.0 AAA 3.1.5",
        "image-redundant-alt": "WCAG 2.0 A 1.1.1",
        "empty-heading": "WCAG 2.0 A 1.3.1",
        "pdf_no_language": "WCAG 2.0 A 3.1.1",
        "identical-links-same-purpose": "WCAG 2.0 A 2.4.4",
        "pdf_heading_order": "WCAG 2.0 A 1.3.1",
        "pdf_no_bookmarks": "WCAG 2.0 AA 2.4.5",
    }
    for rule_id, criterion in expected.items():
        assert catalog[rule_id].wcag_criterion == criterion, rule_id


def test_rank_follows_the_listed_order():
    assert content_rank("broken-links") == 0
    assert content_rank("pdf_no_bookmarks") == len(CONTENT_CHECK_ORDER) - 1
    assert content_rank("not-a-check") == len(CONTENT_CHECK_ORDER)


def test_link_purpose_check_flags_filler_link_text():
    signals = {"vagueLinks": [
        {"text": "Click here", "href": "/enrol", "selector": "a#a", "html": "<a>Click here</a>"},
        {"text": "Read more", "href": "/news", "selector": "a#b", "html": "<a>Read more</a>"},
    ]}
    found = check_link_purpose_unclear(signals)
    assert [f["rule_id"] for f in found] == ["link_purpose_unclear"] * 2
    assert found[0]["category"] == "content"
    assert found[0]["criterion_id"] == "2.4.4"


def test_reading_level_is_stricter_than_the_readability_advice():
    """3.1.5 is a threshold criterion; `readability` is graded advice."""
    plain = "The cat sat on the mat. It was a good day. We ran to the park. " * 30
    dense = (
        "The utilisation of heterogeneous methodological frameworks necessitates "
        "comprehensive epistemological reconsideration of institutional paradigms. "
    ) * 20

    assert check_reading_level(plain) == []
    assert check_readability(plain) == []

    hard = check_reading_level(dense)
    assert len(hard) == 1
    assert hard[0]["criterion"] == ("2.0", "AAA", "3.1.5", "Reading Level")
