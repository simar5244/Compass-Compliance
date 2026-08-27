import json

import requests

from app.audit import sitemap_checks


class FakeResponse:
    def __init__(self, status_code: int, content: bytes = b""):
        self.status_code = status_code
        self.content = content


def _responses(mapping):
    def get(url, **_kwargs):
        value = mapping.get(url)
        if isinstance(value, Exception):
            raise value
        return value or FakeResponse(404)

    return get


def test_sitemap_missing_when_both_candidates_fail(monkeypatch):
    monkeypatch.setattr(sitemap_checks.requests, "get", _responses({}))

    result = sitemap_checks.inspect_sitemaps("https://example.com/")

    assert result.found is False
    assert [f["check_id"] for f in result.findings] == ["sitemap_missing"]
    assert json.loads(result.findings[0]["html_snippet"]) == {
        "found": False,
        "urls_tried": ["https://example.com/sitemap.xml", "https://example.com/sitemap_index.xml"],
    }


def test_sitemap_missing_does_not_fire_when_xml_sitemap_exists(monkeypatch):
    monkeypatch.setattr(sitemap_checks.requests, "get", _responses({
        "https://example.com/sitemap.xml": FakeResponse(
            200, b"<urlset><url><loc>https://example.com/about</loc></url></urlset>"
        ),
    }))

    result = sitemap_checks.inspect_sitemaps("https://example.com")

    assert result.findings == []
    assert result.parsed is True
    assert "https://example.com/about" in result.urls


def test_sitemap_malformed_fires_for_invalid_xml(monkeypatch):
    monkeypatch.setattr(sitemap_checks.requests, "get", _responses({
        "https://example.com/sitemap.xml": FakeResponse(200, b"<urlset><url>")
    }))

    result = sitemap_checks.inspect_sitemaps("https://example.com")

    assert [f["check_id"] for f in result.findings] == ["sitemap_malformed"]
    assert result.parsed is False


def test_sitemap_malformed_does_not_fire_for_valid_index_and_child(monkeypatch):
    monkeypatch.setattr(sitemap_checks.requests, "get", _responses({
        "https://example.com/sitemap.xml": FakeResponse(
            200, b"<sitemapindex><sitemap><loc>https://example.com/pages.xml</loc></sitemap></sitemapindex>"
        ),
        "https://example.com/pages.xml": FakeResponse(
            200, b"<urlset><url><loc>https://example.com/contact/</loc></url></urlset>"
        ),
    }))

    result = sitemap_checks.inspect_sitemaps("https://example.com")

    assert result.findings == []
    assert result.parsed is True
    assert "https://example.com/contact" in result.urls


def test_page_missing_from_sitemap_fires_for_crawled_page_absent_from_sitemap():
    findings = sitemap_checks.missing_page_findings(
        ["https://example.com/", "https://example.com/about"],
        {"https://example.com"},
        "https://example.com/sitemap.xml",
    )

    assert len(findings) == 1
    assert findings[0]["check_id"] == "page_missing_from_sitemap"
    assert findings[0]["manual_review"] is True
    assert json.loads(findings[0]["html_snippet"])["page_url"] == "https://example.com/about"


def test_page_in_sitemap_does_not_fire():
    assert sitemap_checks.missing_page_findings(
        ["https://example.com/about/"],
        {"https://example.com/about"},
        "https://example.com/sitemap.xml",
    ) == []


def test_sitemap_url_normalization_ignores_trailing_slash_and_tracking_params():
    assert sitemap_checks.normalize_sitemap_url(
        "HTTPS://EXAMPLE.COM/about/?utm_source=newsletter&gclid=abc"
    ) == "https://example.com/about"
    assert sitemap_checks.normalize_sitemap_url("https://example.com/about") == "https://example.com/about"


def test_page_missing_from_sitemap_is_capped_at_500():
    pages = [f"https://example.com/page-{i}" for i in range(600)]
    findings = sitemap_checks.missing_page_findings(
        pages, set(), "https://example.com/sitemap.xml"
    )

    assert len(findings) == 500
