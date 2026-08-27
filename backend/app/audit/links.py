"""Broken-link checking via cheap HTTP requests.

External links are never rendered — per the crawl rules, only same-site pages go
through Chromium. To report broken links we do a lightweight HEAD (falling back
to a ranged GET for servers that reject HEAD) on each UNIQUE outbound URL once,
then attribute failures back to the pages that reference them.

A link is "broken" if it resolves to a 4xx/5xx status or the request fails
(DNS, connection, timeout). 401/403 are treated as reachable-but-restricted, not
broken, to avoid false positives on login-walled targets.
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass

import httpx

logger = logging.getLogger("wcag_scanner.audit.links")

# Statuses that mean "the link works, you just can't see it unauthenticated".
# Note: 403/429 often indicate bot-blocking or rate-limiting; we still surface
# them as issues (with a UI note that they may be false positives).
_NOT_BROKEN_4XX = {401}


@dataclass
class LinkStatus:
    url: str
    status_code: int | None
    ok: bool
    reason: str


async def _check_one(url: str, client: httpx.AsyncClient, sem: asyncio.Semaphore) -> LinkStatus:
    async with sem:
        try:
            resp = await client.head(url, follow_redirects=True)
            if resp.status_code >= 400 and resp.status_code not in (405, 501):
                # Some servers don't support HEAD (405/501) — retry with a tiny GET.
                if resp.status_code in _NOT_BROKEN_4XX:
                    return LinkStatus(url, resp.status_code, True, "restricted")
                resp = await client.get(url, follow_redirects=True, headers={"Range": "bytes=0-0"})
            code = resp.status_code
            if code in _NOT_BROKEN_4XX:
                return LinkStatus(url, code, True, "restricted")
            if code >= 400:
                return LinkStatus(url, code, False, f"HTTP {code}")
            return LinkStatus(url, code, True, "ok")
        except httpx.HTTPError as exc:
            return LinkStatus(url, None, False, type(exc).__name__)


async def check_links(
    urls: set[str],
    *,
    concurrency: int = 10,
    timeout: float = 10.0,
    user_agent: str = "",
) -> dict[str, LinkStatus]:
    """Check each unique URL once. Returns {url: LinkStatus}."""
    checkable = [u for u in urls if u.startswith(("http://", "https://"))]
    if not checkable:
        return {}
    sem = asyncio.Semaphore(concurrency)
    headers = {"User-Agent": user_agent} if user_agent else {}
    async with httpx.AsyncClient(timeout=timeout, headers=headers) as client:
        results = await asyncio.gather(*(_check_one(u, client, sem) for u in checkable))
    return {r.url: r for r in results}


def broken_link_findings(page_links: list[dict], statuses: dict[str, LinkStatus]) -> list[dict]:
    """Finding dicts for the broken links referenced by one page.

    `page_links` is a list of per-occurrence records like:
      { url, text, selector, bbox }
    """
    by_url: dict[str, dict] = {}
    for occ in page_links:
        if not isinstance(occ, dict):
            continue
        url = occ.get("url")
        if not isinstance(url, str) or not url:
            continue
        if url not in by_url:
            by_url[url] = {
                "url": url,
                "text": occ.get("text") if isinstance(occ.get("text"), str) else "",
                "selector": occ.get("selector") if isinstance(occ.get("selector"), str) else None,
                "bbox": occ.get("bbox") if isinstance(occ.get("bbox"), dict) else None,
                "all_selectors": [],
                "occurrence_count": 0,
            }
        rec = by_url[url]
        rec["occurrence_count"] += 1
        sel = occ.get("selector")
        if isinstance(sel, str) and sel:
            rec["all_selectors"].append(sel)
        if rec["selector"] is None and isinstance(sel, str) and sel:
            rec["selector"] = sel
        if rec["bbox"] is None and isinstance(occ.get("bbox"), dict):
            rec["bbox"] = occ["bbox"]

    findings: list[dict] = []
    for url, rec in by_url.items():
        status = statuses.get(url)
        if not status or status.ok:
            continue
        code = status.status_code
        reason = status.reason
        payload = {
            "url": url,
            "anchor_text": rec.get("text") or "",
            "http_status": int(code) if isinstance(code, int) else 0,
            "error_type": reason or "",
            "selector": rec.get("selector"),
            "all_selectors": rec.get("all_selectors") or [],
            "occurrence_count": int(rec.get("occurrence_count") or 1),
        }
        findings.append({
            "check_id": "broken-links", "category": "content", "subcategory": "Links",
            "impact": "serious",
            "description": f"Broken link ({reason})",
            "remediation": "Update or remove the link so it points at a working destination.",
            "selector": rec.get("selector"),
            "bbox": rec.get("bbox"),
            "viewport": "desktop" if rec.get("bbox") else None,
            "html_snippet": json.dumps(payload, ensure_ascii=False),
            "weight": 1.0,
        })
    return findings
