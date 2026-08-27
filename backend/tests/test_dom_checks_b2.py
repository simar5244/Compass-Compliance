"""Group B sub-batch 2 — pure DOM / URL checks."""

import json

from app.audit.dom_checks import (
    check_accessible_page_title,
    check_broken_anchor_links,
    check_consistent_help,
    check_abbreviations,
    check_consistent_identification,
    check_custom_tab_order,
    check_drag_alternative,
    check_flashing_content,
    check_images_of_text,
    check_interruptions,
    check_keyboard_functionality,
    check_large_controls,
    check_link_no_text,
    check_meta_description_length,
    check_meaningful_sequence,
    check_multiple_ways,
    check_pause_animated_content,
    check_redundant_entry,
    check_time_limits,
    check_unusual_words,
    check_visual_presentation,
    check_new_tab_disclosure,
    check_headings_labels_descriptive,
    check_text_conveys_information,
    check_multiple_h1,
    check_placeholder_links,
    check_structured_data,
    check_table_summary,
    check_thin_pages,
    check_title_length,
    check_url_file_extension,
    check_url_underscores,
    run_dom_checks_b2,
)


def _sig(**kw):
    base = {
        "title": "A fine title", "h1_count": 1, "h1_texts": ["H"], "meta_description": None,
        "placeholderLinks": [], "emptyLinks": [], "brokenAnchors": [],
        "table_count": 0, "tables_without_summary": 0, "favicons": [],
        "has_significant_media": False, "_json_ld": False, "_microdata": False,
    }
    base.update(kw)
    return base


# --- B12 placeholder links ----------------------------------------------

def test_placeholder_links_fires_and_scored():
    out = check_placeholder_links(_sig(placeholderLinks=[{"text": "x", "href": "#", "selector": "a:nth-of-type(1)"}]))
    assert out and out[0]["rule_id"] == "placeholder_links" and out[0]["manual_review"] is False


def test_placeholder_links_clears():
    assert check_placeholder_links(_sig()) == []


# --- B13 structured data (assisted) -------------------------------------

def test_structured_data_fires_when_absent_and_is_assisted():
    out = check_structured_data(_sig())
    assert out and out[0]["rule_id"] == "structured_data_missing" and out[0]["manual_review"] is True


def test_structured_data_clears_with_jsonld():
    assert check_structured_data(_sig(_json_ld=True)) == []


# --- B16 / B17 URL checks ------------------------------------------------

def test_url_file_extension_fires():
    out = check_url_file_extension("https://x.test/page.php?q=1")
    assert out and json.loads(out[0]["html_snippet"])["extension"] == ".php"
    assert out[0]["impact"] == "moderate"


def test_url_file_extension_clears_on_clean_url():
    assert check_url_file_extension("https://x.test/programs/grade-levels") == []


def test_url_underscores_fires_and_assisted():
    out = check_url_underscores("https://x.test/a_b_c")
    assert out and out[0]["rule_id"] == "url_underscores" and out[0]["manual_review"] is True
    assert json.loads(out[0]["html_snippet"])["underscores_count"] == 2


def test_url_underscores_clears():
    assert check_url_underscores("https://x.test/a-b-c") == []


# --- B18 thin pages ------------------------------------------------------

def test_thin_pages_fires_under_threshold_without_media():
    assert check_thin_pages(_sig(), word_count=120)


def test_thin_pages_clears_with_media_or_enough_words():
    assert check_thin_pages(_sig(has_significant_media=True), word_count=10) == []
    assert check_thin_pages(_sig(), word_count=500) == []


# --- B19 / B20 / B21 -----------------------------------------------------

def test_title_too_long():
    assert check_title_length(_sig(title="x" * 61))
    assert check_title_length(_sig(title="x" * 60)) == []


def test_multiple_h1():
    out = check_multiple_h1(_sig(h1_count=3, h1_texts=["a", "b", "c"]))
    assert out and json.loads(out[0]["html_snippet"])["h1_count"] == 3
    assert check_multiple_h1(_sig(h1_count=1)) == []


def test_meta_description_too_short_only_when_present():
    assert check_meta_description_length(_sig(meta_description="short")) != []      # < 60
    assert check_meta_description_length(_sig(meta_description="y" * 60)) == []      # ok
    assert check_meta_description_length(_sig(meta_description=None)) == []          # missing = other check


def test_new_tab_links_require_a_disclosure():
    out = check_new_tab_disclosure(_sig(undisclosedNewTabLinks=[{
        "text": "Admissions", "href": "https://x.test/admissions", "selector": "a:nth-of-type(1)",
    }]))
    assert len(out) == 1 and out[0]["rule_id"] == "new_tab_disclosure"
    assert out[0]["category"] == "content"


def test_subjective_content_checks_are_manual_review():
    headings = check_headings_labels_descriptive(_sig(headingsAndLabels=[{
        "element": "h2", "text": "Learn more", "selector": "h2:nth-of-type(1)",
    }]))
    text = check_text_conveys_information(_sig(sensoryLanguage=[{
        "text": "shown in red", "context": "Required fields are shown in red", "selector": "#help",
    }]))
    assert headings[0]["manual_review"] is True
    assert text[0]["manual_review"] is True


def test_subjective_content_checks_do_not_flag_without_evidence():
    assert check_headings_labels_descriptive(_sig(headingsAndLabels=[{
        "element": "h2", "text": "Admissions requirements", "selector": "#requirements",
    }])) == []
    assert check_text_conveys_information(_sig()) == []


# --- B22 / B28 / B29 (accessibility, assisted for now) ------------------

def test_table_summary_assisted():
    out = check_table_summary(_sig(table_count=2, tables_without_summary=2))
    assert out and out[0]["manual_review"] is True and out[0]["category"] == "accessibility"


def test_link_no_text_one_per_link_assisted():
    out = check_link_no_text(_sig(emptyLinks=[{"selector": "a:nth-of-type(1)", "href": "/x"}]))
    assert len(out) == 1 and out[0]["rule_id"] == "link_no_text" and out[0]["manual_review"] is True


def test_broken_anchor_links_one_per_anchor():
    out = check_broken_anchor_links(_sig(brokenAnchors=[{"href": "#gone", "missing_id": "gone", "selector": "a:nth-of-type(1)"}]))
    assert len(out) == 1 and out[0]["rule_id"] == "broken_anchor_links"
    assert json.loads(out[0]["html_snippet"])["missing_id"] == "gone"


def test_keyboard_functionality_uses_detected_clickable_elements():
    out = check_keyboard_functionality(_sig(keyboardInaccessible=[{
        "selector": "#fake-button", "element": "div", "html": '<div onclick="go()">Go</div>',
    }]))
    assert out[0]["rule_id"] == "keyboard_functionality"
    assert out[0]["selector"] == "#fake-button"
    assert out[0]["manual_review"] is False


def test_consistent_help_is_manual_and_requires_real_help_evidence():
    assert check_consistent_help(_sig()) == []
    out = check_consistent_help(_sig(helpMechanisms=[{
        "selector": "#help", "text": "Help", "href": "/help", "element": "a",
    }]))
    assert out[0]["rule_id"] == "consistent_help" and out[0]["manual_review"] is True


def test_accessible_page_title_flags_missing_or_generic_titles_only():
    assert check_accessible_page_title(_sig(title="Home"))
    assert check_accessible_page_title(_sig(title=""))
    assert check_accessible_page_title(_sig(title="K-12 Programs | Texas Tech")) == []


def test_meaningful_sequence_is_manual_and_uses_detected_risks():
    assert check_meaningful_sequence(_sig()) == []
    out = check_meaningful_sequence(_sig(sequenceRisks=[{
        "selector": "#later", "reason": "CSS order -1 may differ from DOM order", "html": "<div />",
    }]))
    assert out[0]["rule_id"] == "meaningful_sequence" and out[0]["manual_review"] is True


def test_extended_accessibility_checks_only_emit_from_matching_evidence():
    clean = _sig(wayCount=2)
    for check in (
        check_redundant_entry, check_drag_alternative, check_time_limits,
        check_pause_animated_content, check_unusual_words, check_visual_presentation,
        check_interruptions, check_large_controls, check_abbreviations,
        check_images_of_text, check_custom_tab_order, check_flashing_content,
        check_consistent_identification, check_multiple_ways,
    ):
        assert check(clean) == []

    evidenced = _sig(
        duplicateFormFields=[{"selector": "#again"}], dragElements=[{"selector": "#card"}],
        timeLimitCandidate={"selector": "#timer", "text": "30 seconds remaining"},
        movingContent=[{"selector": "#ticker"}], unusualWordCandidates=[{"selector": "#term"}],
        visualPresentationRisks=[{"selector": "#locked"}], interruptionElements=[{"selector": "#alert"}],
        largeControlCandidates=[{"selector": "#tiny", "width": 20, "height": 20}],
        abbreviationsWithoutMeaning=[{"selector": "#abbr", "text": "TTU"}],
        imageTextCandidates=[{"selector": "#wordmark", "alt": "Texas Tech University"}],
        tabOrderRisks=[{"selector": "#late", "reason": "positive tabindex"}],
        flashCandidates=[{"selector": "#video", "element": "video"}],
        inconsistentComponents=[{"selector": "#second", "href": "/x", "name": "X", "other_name": "More"}],
        wayCount=1,
    )
    ids = {item["rule_id"] for item in run_dom_checks_b2(evidenced, "https://x.test", 500)}
    assert {
        "redundant_entry", "drag_alternative", "inactivity_data_loss", "timing_not_essential",
        "pause_animated_content", "unusual_words_definitions", "visual_presentation_text",
        "interruptions_suppressible", "large_interactive_controls", "abbreviations_meaning",
        "images_of_text", "custom_tab_order", "three_flashes_a", "flashing_content_aaa",
        "consistent_identification", "multiple_ways",
    } <= ids


# --- runner --------------------------------------------------------------

def test_run_b2_empty_signals_is_safe():
    assert run_dom_checks_b2({}, "http://x", 100) == []


def test_run_b2_aggregates():
    sig = _sig(
        title="x" * 80,
        h1_count=2,
        placeholderLinks=[{"text": "a", "href": "#", "selector": "a:nth-of-type(1)"}],
        sensoryLanguage=[{"text": "shown in red", "context": "shown in red", "selector": "#help"}],
    )
    ids = {r["rule_id"] for r in run_dom_checks_b2(sig, "https://x.test/p.aspx", 50)}
    assert {"title_too_long", "placeholder_links", "url_file_extension", "structured_data_missing", "text_conveys_information"} <= ids
    assert "multiple_h1" not in ids and "thin_pages" not in ids
