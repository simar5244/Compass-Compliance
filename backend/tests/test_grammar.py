"""Grammar engine unit tests.

The mapping/excerpt/filter helpers are exercised with lightweight fake Match
objects so they run without the Java LanguageTool server. A single integration
test drives the real engine and is skipped when Java/LanguageTool is unavailable.
"""

from dataclasses import dataclass, field

import pytest

import json

from app.audit import content_checks
from app.audit.content_checks import _grammar_record, grammar_sources, run_grammar_records
from app.audit.grammar_checks import GrammarChecker, ensure_java


def _finding(rule_id="R", error_text="will will", severity="error", group="Word repetition",
             source="visible"):
    return {
        "rule_id": rule_id, "rule_message": "msg", "category": "GRAMMAR",
        "silktide_group": group, "severity": severity, "excerpt": "...will will...",
        "corrected_excerpt": "...will...", "error_text": error_text, "replacement": "will",
        "source_type": source, "lang_code": "en-US", "page_url": "http://x",
    }


@dataclass
class FakeMatch:
    rule_id: str = ""
    category: str = ""
    message: str = "msg"
    replacements: list = field(default_factory=list)
    context: str = ""
    offset_in_context: int = 0
    error_length: int = 0
    matched_text: str = ""


def test_detect_language_english():
    assert GrammarChecker().detect_language("Hello world, this is a test sentence.") == "en-US"


def test_detect_language_empty_defaults_en():
    assert GrammarChecker().detect_language("") == "en-US"
    assert GrammarChecker().detect_language("   ") == "en-US"


def test_map_rule_word_repeat_is_error():
    gc = GrammarChecker()
    assert gc._map_rule(FakeMatch(rule_id="ENGLISH_WORD_REPEAT_RULE")) == (
        "Word repetition (e.g. 'will will')", "error")


def test_map_rule_a_vs_an_is_warning():
    gc = GrammarChecker()
    assert gc._map_rule(FakeMatch(rule_id="EN_A_VS_AN")) == ("Use of 'a' vs. 'an'", "warning")


def test_map_rule_typos_category():
    gc = GrammarChecker()
    # An unmapped rule keeps LanguageTool's own wording rather than a generic label.
    assert gc._map_rule(FakeMatch(rule_id="MORFOLOGIK_RULE_EN_US", category="TYPOS")) == ("msg", "warning")


def test_map_rule_fallback():
    gc = GrammarChecker()
    assert gc._map_rule(FakeMatch(rule_id="SOMETHING_ELSE", category="MISC")) == ("msg", "warning")


def test_should_include_skips_whitespace_rule():
    # Block elements are separated by blank lines before grammar runs, so that
    # repetition is not reported across boundaries a reader never sees. The
    # spacing is ours, not the page's, so complaints about it are unactionable.
    gc = GrammarChecker()
    assert gc._should_include(FakeMatch(rule_id="WHITESPACE_RULE", category="MISC")) is False


def test_should_include_skips_consecutive_spaces():
    gc = GrammarChecker()
    assert gc._should_include(FakeMatch(rule_id="CONSECUTIVE_SPACES", category="TYPOGRAPHY")) is False


def test_should_include_keeps_grammar():
    gc = GrammarChecker()
    assert gc._should_include(FakeMatch(rule_id="A_VS_AN", category="GRAMMAR")) is True


def test_build_excerpt_contains_error_unmodified():
    gc = GrammarChecker()
    context = "The quick brown fox jumps over teh lazy dog near the river bank."
    err = context.index("teh")
    out = gc._build_excerpt(context, err, err + 3)
    assert "teh" in out


def test_build_excerpt_truncates_long_context():
    gc = GrammarChecker()
    context = "x" * 200 + "ERR" + "y" * 200
    out = gc._build_excerpt(context, 200, 203)
    assert out.startswith("...") and out.endswith("...")
    assert "ERR" in out


def test_build_corrected_excerpt_applies_replacement():
    gc = GrammarChecker()
    context = "I saw a apple on the table today."
    err = context.index("a apple")  # 'a' -> 'an'
    out = gc._build_corrected_excerpt(context, err, err + 1, "an")
    assert "an apple" in out


def test_check_page_returns_empty_when_engine_unavailable(monkeypatch):
    """No sources / disabled engine must never raise inside the scan pipeline."""
    monkeypatch.setattr(GrammarChecker, "get_tool", classmethod(lambda cls, lang="en-US": None))
    out = GrammarChecker().check_page({"visible": "Some text here."}, "http://x")
    assert out == []


# --- pipeline records + site-wide filtering (no Java) ----------------------

def test_grammar_sources_maps_four_sources():
    content = {"mainText": "body copy", "text": "full", "title": "T",
               "altTexts": "alt one. alt two", "navText": "Home About"}
    src = grammar_sources(content)
    assert src == {"visible": "body copy", "title": "T",
                   "alt_text": "alt one. alt two", "navigation": "Home About"}


def test_grammar_sources_falls_back_to_text_when_no_maintext():
    src = grammar_sources({"text": "full body", "title": "", "altTexts": "", "navText": ""})
    assert src["visible"] == "full body"


def test_grammar_record_shape_and_payload():
    rec = _grammar_record(_finding(severity="error"))
    assert rec["rule_id"] == "grammar"
    assert rec["category"] == "content" and rec["subcategory"] == "Grammar"
    assert rec["impact"] == "moderate"           # error -> moderate
    assert rec["description"] == "Word repetition"
    payload = json.loads(rec["html_snippet"])
    assert payload["error_text"] == "will will"
    assert payload["severity"] == "error"
    assert payload["source_type"] == "visible"
    assert payload["corrected_excerpt"] == "...will..."


def test_grammar_record_warning_impact_minor():
    assert _grammar_record(_finding(severity="warning"))["impact"] == "minor"


def test_run_grammar_records_filters_approved_text(monkeypatch):
    monkeypatch.setattr(GrammarChecker, "check_page",
                        lambda self, sources, url: [_finding(error_text="will will")])
    kept = run_grammar_records({"mainText": "x"}, "http://x")
    assert len(kept) == 1
    filtered = run_grammar_records({"mainText": "x"}, "http://x", approved={"will will"})
    assert filtered == []


def test_run_grammar_records_filters_ignored_rule(monkeypatch):
    monkeypatch.setattr(GrammarChecker, "check_page",
                        lambda self, sources, url: [_finding(rule_id="WORD_REPEAT_RULE")])
    filtered = run_grammar_records({"mainText": "x"}, "http://x",
                                   ignored_rules={"WORD_REPEAT_RULE"})
    assert filtered == []


# --- integration (real LanguageTool) --------------------------------------

_JAVA_OK = ensure_java()


@pytest.mark.skipif(not _JAVA_OK, reason="no Java >= 17 for LanguageTool")
def test_check_page_integration_flags_and_merges_sources():
    gc = GrammarChecker()
    if gc.get_tool("en-US") is None:
        pytest.skip("LanguageTool unavailable")
    sources = {
        "visible": "The the cat sat. I have went to the store.",
        "title": "Welcom to our site",
        "alt_text": "a picture of a dog",
        "navigation": "Home About Contact",
    }
    findings = gc.check_page(sources, "http://example.com")
    assert isinstance(findings, list) and len(findings) > 0
    # Findings must be tagged with their originating source and required fields.
    source_types = {f["source_type"] for f in findings}
    assert source_types.issubset({"visible", "title", "alt_text", "navigation"})
    for f in findings:
        assert f["rule_id"] and f["severity"] in ("error", "warning")
        assert f["error_text"] and f["excerpt"]
        assert f["page_url"] == "http://example.com"
