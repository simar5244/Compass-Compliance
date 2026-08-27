"""Post-crawl sitemap checks.

Sitemaps are fetched after the crawl so their URL inventory can be compared to
the pages that were actually discovered.  These checks deliberately use the
plain ``requests`` client: they are small, bounded site-level requests and do
not need a browser context.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from urllib.parse import parse_qsl, urlencode, urlparse, urlunparse
from xml.etree import ElementTree

import requests

from app.render.worker import DESKTOP_USER_AGENT

logger = logging.getLogger("wcag_scanner.audit.sitemap_checks")

REQUEST_TIMEOUT = 10
SITEMAP_PATHS = ("/sitemap.xml", "/sitemap_index.xml")
MAX_MISSING_PAGES = 500


@dataclass
class SitemapInspection:
    """The result of locating and parsing a site's sitemap(s)."""

    urls_tried: list[str] = field(default_factory=list)
    found: bool = False
    sitemap_url: str | None = None
    parsed: bool = False
    urls: set[str] = field(default_factory=set)
    findings: list[dict] = field(default_factory=list)


def _local_name(tag: str) -> str:
    return tag.rsplit("}", 1)[-1].lower()


def _payload(value: dict) -> str:
    return json.dumps(value, ensure_ascii=False, sort_keys=True)


def _finding(
    rule_id: str,
    impact: str,
    description: str,
    remediation: str,
    payload: dict,
    *,
    manual_review: bool = False,
) -> dict:
    return {
        "check_id": rule_id,
        "category": "marketing",
        "subcategory": "Technical optimization",
        "impact": impact,
        "description": description,
        "remediation": remediation,
        "selector": None,
        "html_snippet": _payload(payload),
        "weight": 1.0,
        "manual_review": manual_review,
    }


def normalize_sitemap_url(value: str) -> str:
    """Normalize URLs for sitemap membership comparison.

    Tracking parameters are removed while functional query parameters are
    retained.  Fragments are never sent to a server and are ignored.
    """
    parsed = urlparse(value.strip())
    query = [
        (key, val)
        for key, val in parse_qsl(parsed.query, keep_blank_values=True)
        if not (key.lower().startswith("utm_") or key.lower() in {"fbclid", "gclid"})
    ]
    path = parsed.path or "/"
    if path != "/":
        path = path.rstrip("/") or "/"
    return urlunparse((parsed.scheme.lower(), parsed.netloc.lower(), path, "", urlencode(query), ""))


def _get(url: str):
    return requests.get(
        url,
        timeout=REQUEST_TIMEOUT,
        headers={"User-Agent": DESKTOP_USER_AGENT},
    )


def _locs(root: ElementTree.Element) -> list[str]:
    return [
        (element.text or "").strip()
        for element in root.iter()
        if _local_name(element.tag) == "loc" and (element.text or "").strip()
    ]


def _parse_sitemap(content: bytes | str) -> tuple[str, list[str]]:
    root = ElementTree.fromstring(content)
    kind = _local_name(root.tag)
    if kind not in {"urlset", "sitemapindex"}:
        raise ValueError(f"Unexpected sitemap root element: {kind}")
    return kind, _locs(root)


def inspect_sitemaps(site_root: str) -> SitemapInspection:
    """Locate and parse the site's sitemap, returning check findings."""
    result = SitemapInspection()
    root = site_root.rstrip("/")

    response = None
    for path in SITEMAP_PATHS:
        url = f"{root}{path}"
        result.urls_tried.append(url)
        try:
            candidate = _get(url)
        except requests.RequestException as exc:
            logger.info("Sitemap request failed for %s: %s", url, exc)
            continue
        if candidate.status_code == 200:
            response = candidate
            result.found = True
            result.sitemap_url = url
            break

    if response is None:
        result.findings.append(_finding(
            "sitemap_missing", "serious", "No XML sitemap found",
            "Publish a valid sitemap.xml or sitemap_index.xml at the site root.",
            {"urls_tried": result.urls_tried, "found": False},
        ))
        return result

    try:
        kind, locs = _parse_sitemap(response.content)
    except (ElementTree.ParseError, ValueError) as exc:
        result.findings.append(_finding(
            "sitemap_malformed", "moderate", "Sitemap XML is malformed",
            "Fix the sitemap XML so it can be parsed by search engines.",
            {"sitemap_url": result.sitemap_url, "error": str(exc)},
        ))
        return result

    if kind == "urlset":
        result.urls = {normalize_sitemap_url(url) for url in locs}
        result.parsed = True
        return result

    # Sitemap indexes contain child sitemap URLs. A child can fail or be
    # malformed even when the index itself is valid.
    malformed_children: list[dict] = []
    for child_url in locs:
        try:
            child_response = _get(child_url)
            if child_response.status_code != 200:
                malformed_children.append({"sitemap_url": child_url, "error": f"HTTP {child_response.status_code}"})
                continue
            child_kind, child_locs = _parse_sitemap(child_response.content)
            if child_kind == "sitemapindex":
                malformed_children.append({"sitemap_url": child_url, "error": "Nested sitemap indexes are not supported"})
            else:
                result.urls.update(normalize_sitemap_url(url) for url in child_locs)
        except requests.RequestException as exc:
            malformed_children.append({"sitemap_url": child_url, "error": str(exc)})
        except (ElementTree.ParseError, ValueError) as exc:
            malformed_children.append({"sitemap_url": child_url, "error": str(exc)})

    if malformed_children:
        for child in malformed_children:
            result.findings.append(_finding(
                "sitemap_malformed", "moderate", "A child sitemap is malformed or unavailable",
                "Fix or remove the invalid child sitemap referenced by the sitemap index.",
                child,
            ))
        return result

    result.parsed = True
    return result


def missing_page_findings(
    crawled_urls: list[str] | set[str], sitemap_urls: set[str], sitemap_url: str, *, cap: int = MAX_MISSING_PAGES
) -> list[dict]:
    """Create assisted findings for crawled, non-document URLs absent from a sitemap."""
    normalized_sitemap_urls = {normalize_sitemap_url(url) for url in sitemap_urls}
    findings = []
    for page_url in crawled_urls:
        if normalize_sitemap_url(page_url) in normalized_sitemap_urls:
            continue
        findings.append(_finding(
            "page_missing_from_sitemap", "minor", "Page is missing from the sitemap",
            "Review whether this page should be included in the XML sitemap.",
            {"page_url": page_url, "sitemap_url": sitemap_url},
            manual_review=True,
        ))
        if len(findings) >= cap:
            break
    return findings


def run_sitemap_checks(site_root: str, crawled_urls: list[str] | set[str]) -> tuple[SitemapInspection, list[dict]]:
    """Run E1/E2 and, when possible, E3 for a site."""
    inspection = inspect_sitemaps(site_root)
    missing = (
        missing_page_findings(crawled_urls, inspection.urls, inspection.sitemap_url)
        if inspection.found and inspection.parsed and inspection.sitemap_url
        else []
    )
    return inspection, missing
