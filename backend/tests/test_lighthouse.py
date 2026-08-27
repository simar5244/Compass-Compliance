"""Group C Lighthouse mapping — pure parsing over fixture result JSON."""

import json

from app.audit.lighthouse import (
    LIGHTHOUSE_RULE_IDS,
    parse_lighthouse_result,
)


def _lhr(audits: dict) -> dict:
    return {"audits": audits}


def _by_id(records):
    return {r["rule_id"]: r for r in records}


def test_score_audit_fires_below_threshold():
    lhr = _lhr({"render-blocking-resources": {
        "score": 0.4, "title": "Eliminate render-blocking resources",
        "details": {"items": [{"url": "a.css", "wastedMs": 300}]},
    }})
    recs = _by_id(parse_lighthouse_result(lhr))
    assert "render_blocking_resources" in recs
    assert recs["render_blocking_resources"]["impact"] == "moderate"
    assert json.loads(recs["render_blocking_resources"]["html_snippet"])["items"]


def test_score_audit_passes_at_high_score():
    lhr = _lhr({"render-blocking-resources": {"score": 1.0}})
    assert parse_lighthouse_result(lhr) == []


def test_score_audit_none_score_does_not_fire():
    lhr = _lhr({"unused-javascript": {"score": None}})
    assert parse_lighthouse_result(lhr) == []


def test_offscreen_images_is_error_severity():
    recs = _by_id(parse_lighthouse_result(_lhr({"offscreen-images": {"score": 0.2, "title": "Defer offscreen images"}})))
    assert recs["defer_offscreen_images"]["impact"] == "serious"


def test_image_optimization_is_content_category():
    recs = _by_id(parse_lighthouse_result(_lhr({"uses-optimized-images": {"score": 0.3, "title": "Optimize images"}})))
    assert recs["image_optimization"]["category"] == "content"


def test_dom_size_threshold():
    assert "excessive_dom_size" in _by_id(parse_lighthouse_result(_lhr({"dom-size": {"numericValue": 2000, "title": "DOM size"}})))
    assert parse_lighthouse_result(_lhr({"dom-size": {"numericValue": 1000}})) == []


def test_total_byte_weight_threshold():
    assert "total_page_weight" in _by_id(parse_lighthouse_result(_lhr({"total-byte-weight": {"numericValue": 2_000_000}})))
    assert parse_lighthouse_result(_lhr({"total-byte-weight": {"numericValue": 500_000}})) == []


def test_tti_threshold_info_severity():
    recs = _by_id(parse_lighthouse_result(_lhr({"interactive": {"numericValue": 8000, "title": "TTI"}})))
    assert recs["time_to_interactive"]["impact"] == "minor"


def test_missing_js_and_css_from_network_requests():
    lhr = _lhr({"network-requests": {"details": {"items": [
        {"url": "https://x/app.js", "statusCode": 404, "resourceType": "Script"},
        {"url": "https://x/main.css", "statusCode": 404, "resourceType": "Stylesheet"},
        {"url": "https://x/ok.js", "statusCode": 200, "resourceType": "Script"},
    ]}}})
    recs = _by_id(parse_lighthouse_result(lhr))
    assert json.loads(recs["missing_js_files"]["html_snippet"])["urls"] == ["https://x/app.js"]
    assert json.loads(recs["missing_css_files"]["html_snippet"])["urls"] == ["https://x/main.css"]


def test_missing_audit_ids_are_skipped():
    # A result with none of our audit ids yields nothing, never raises.
    assert parse_lighthouse_result(_lhr({"some-other-audit": {"score": 0.1}})) == []


def test_empty_result_is_safe():
    assert parse_lighthouse_result({}) == []
    assert parse_lighthouse_result({"audits": {}}) == []


def test_catalog_lists_all_rule_ids():
    assert "render_blocking_resources" in LIGHTHOUSE_RULE_IDS
    assert "missing_css_files" in LIGHTHOUSE_RULE_IDS
    assert len(LIGHTHOUSE_RULE_IDS) == 23
