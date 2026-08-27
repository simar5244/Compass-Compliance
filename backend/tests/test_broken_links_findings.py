"""Unit tests for broken link findings payload (selector/bbox/html_snippet JSON)."""

from __future__ import annotations

import json

from app.audit.links import LinkStatus, broken_link_findings


def test_broken_link_finding_includes_selector_bbox_and_payload():
    occ = [
        {
            "url": "https://broken.example.com",
            "text": "Student Organizations",
            "selector": "a.nav-link",
            "bbox": {"x": 10, "y": 600, "width": 100, "height": 20},
        }
    ]
    statuses = {"https://broken.example.com": LinkStatus("https://broken.example.com", 404, False, "HTTP 404")}
    findings = broken_link_findings(occ, statuses)
    assert len(findings) == 1
    f = findings[0]
    assert f["selector"] == "a.nav-link"
    assert f["bbox"]["y"] == 600
    payload = json.loads(f["html_snippet"])
    assert payload["url"] == "https://broken.example.com"
    assert payload["anchor_text"] == "Student Organizations"
    assert payload["http_status"] == 404


def test_broken_link_occurrence_count_and_all_selectors():
    occ = [
        {
            "url": "https://broken.example.com",
            "text": "Link 1",
            "selector": "a.one",
            "bbox": {"x": 1, "y": 1, "width": 10, "height": 10},
        },
        {
            "url": "https://broken.example.com",
            "text": "Link 2",
            "selector": "footer a.one",
            "bbox": {"x": 2, "y": 2, "width": 10, "height": 10},
        },
        {
            "url": "https://broken.example.com",
            "text": "Link 3",
            "selector": "nav a.one",
            "bbox": {"x": 3, "y": 3, "width": 10, "height": 10},
        },
    ]
    statuses = {"https://broken.example.com": LinkStatus("https://broken.example.com", 500, False, "HTTP 500")}
    findings = broken_link_findings(occ, statuses)
    assert len(findings) == 1
    payload = json.loads(findings[0]["html_snippet"])
    assert payload["occurrence_count"] == 3
    assert payload["all_selectors"] == ["a.one", "footer a.one", "nav a.one"]


def test_check_links_treats_403_as_issue_status():
    # Contract: 403 should be surfaced as a broken-link finding (may be false positive).
    status = LinkStatus("https://blocked.example.com", 403, False, "HTTP 403")
    findings = broken_link_findings(
        [{"url": status.url, "text": "Blocked", "selector": "a.blocked", "bbox": {"x": 1, "y": 1, "width": 1, "height": 1}}],
        {status.url: status},
    )
    assert len(findings) == 1
