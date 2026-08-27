"""robots.txt + sitemap.xml fetching — the ONLY plain-HTTP fetches in the crawl.

Everything that gets audited or scraped for links is rendered in a real browser
(see app/render). These two files are metadata about the crawl, not page content,
so a cheap HTTP GET is correct and much faster than spinning up Chromium.
"""

from __future__ import annotations

import logging
import urllib.robotparser
from urllib.parse import urljoin, urlparse
from xml.etree import ElementTree

import httpx

logger = logging.getLogger("wcag_scanner.crawl.robots")

_SITEMAP_NS = {"sm": "http://www.sitemaps.org/schemas/sitemap/0.9"}


class RobotsTxt:
    """Thin wrapper over the stdlib robots parser, plus discovered sitemap URLs."""

    def __init__(self, parser: urllib.robotparser.RobotFileParser, sitemaps: list[str]):
        self._parser = parser
        self.sitemap_urls = sitemaps

    @classmethod
    async def fetch(cls, root_url: str, client: httpx.AsyncClient) -> "RobotsTxt":
        parsed = urlparse(root_url)
        robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
        parser = urllib.robotparser.RobotFileParser()
        sitemaps: list[str] = []
        try:
            resp = await client.get(robots_url)
            if resp.status_code == 200 and resp.text:
                lines = resp.text.splitlines()
                parser.parse(lines)
                sm = parser.site_maps()
                if sm:
                    sitemaps.extend(sm)
            else:
                parser.parse([])  # missing robots.txt => allow all
        except httpx.HTTPError as exc:
            logger.info("robots.txt fetch failed for %s (%s); allowing all", robots_url, exc)
            parser.parse([])
        return cls(parser, sitemaps)

    def can_fetch(self, url: str, user_agent: str = "*") -> bool:
        try:
            return self._parser.can_fetch(user_agent, url)
        except Exception:
            return True


async def fetch_sitemap_urls(
    sitemap_url: str,
    client: httpx.AsyncClient,
    *,
    max_urls: int = 5000,
    _depth: int = 0,
) -> list[str]:
    """Return page URLs from a sitemap, following <sitemapindex> one level deep.

    Bounded by ``max_urls`` and a small recursion depth so a pathological nested
    sitemap can't blow up the seed set.
    """
    if _depth > 3:
        return []
    try:
        resp = await client.get(sitemap_url)
        if resp.status_code != 200 or not resp.content:
            return []
        root = ElementTree.fromstring(resp.content)
    except (httpx.HTTPError, ElementTree.ParseError) as exc:
        logger.info("sitemap fetch/parse failed for %s (%s)", sitemap_url, exc)
        return []

    tag = root.tag.split("}")[-1]  # strip namespace
    urls: list[str] = []

    if tag == "sitemapindex":
        child_sitemaps = [
            loc.text.strip()
            for loc in root.findall(".//sm:sitemap/sm:loc", _SITEMAP_NS)
            if loc.text
        ]
        for child in child_sitemaps:
            if len(urls) >= max_urls:
                break
            urls.extend(await fetch_sitemap_urls(child, client, max_urls=max_urls, _depth=_depth + 1))
    else:  # urlset
        for loc in root.findall(".//sm:url/sm:loc", _SITEMAP_NS):
            if loc.text:
                urls.append(loc.text.strip())
            if len(urls) >= max_urls:
                break

    return urls[:max_urls]


def default_sitemap_url(root_url: str) -> str:
    parsed = urlparse(root_url)
    return urljoin(f"{parsed.scheme}://{parsed.netloc}", "/sitemap.xml")
