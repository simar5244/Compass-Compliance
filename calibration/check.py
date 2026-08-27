"""Run the real scanner against the calibration fixtures and assert the detected
issue counts match the manifest — a full end-to-end regression check.

CLI:  python calibration/check.py         (serves fixtures + scans + asserts)
Lib:  scan_fixtures(base_url) / compare_to_manifest(...) are imported by the
      pytest integration test.

Requires the backend virtualenv (imports app.*). Run with backend/.venv/bin/python.
"""

from __future__ import annotations

import asyncio
import json
import sys
from collections import Counter
from pathlib import Path

# Make app.* importable when run as a standalone script from the repo root.
_REPO_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_REPO_ROOT / "backend"))

from playwright.async_api import async_playwright  # noqa: E402

from app.audit.links import check_links  # noqa: E402
from app.audit.sitemap_checks import inspect_sitemaps  # noqa: E402
from app.config import settings  # noqa: E402
from app.page_pipeline import audit_page  # noqa: E402
from app.render.capture import DESKTOP_VIEWPORT  # noqa: E402
from app.render.worker import DESKTOP_USER_AGENT, RenderConfig  # noqa: E402

MANIFEST_PATH = Path(__file__).resolve().parent / "manifest.json"


def load_manifest() -> dict:
    return json.loads(MANIFEST_PATH.read_text())


def _render_cfg() -> RenderConfig:
    return RenderConfig(
        goto_timeout_ms=settings.goto_timeout_ms,
        quiet_ms=settings.stability_quiet_ms,
        stability_ceiling_ms=settings.stability_ceiling_ms,
    )


async def scan_fixtures(base_url: str, pages: list[str]) -> dict:
    """Run audit_page against each fixture page. Returns detected per-page rule
    counts, page titles, and all external links found."""
    per_page: dict[str, dict[str, int]] = {}
    titles: dict[str, str] = {}
    external_links: set[str] = set()

    async with async_playwright() as pw:
        browser = await pw.chromium.launch()
        try:
            for page_name in pages:
                url = f"{base_url}/{page_name}"
                context = await browser.new_context(viewport=DESKTOP_VIEWPORT, user_agent=DESKTOP_USER_AGENT)
                try:
                    audited = await audit_page(context, url, _render_cfg(), set(), base_url)
                finally:
                    await context.close()
                if not audited.ok:
                    per_page[page_name] = {"__error__": 1}
                    continue
                counts = Counter(r["rule_id"] for r in audited.records)  # all records (manual + not)
                per_page[page_name] = dict(counts)
                titles[page_name] = audited.title
                external_links.update(audited.external_links)
        finally:
            await browser.close()

    return {"per_page": per_page, "titles": titles, "external_links": external_links}


async def cross_page_counts(scan: dict) -> dict:
    """Cross-page / finalize-level counts: broken links + duplicate-title pages."""
    statuses = await check_links(scan["external_links"], user_agent=DESKTOP_USER_AGENT)
    broken = sum(1 for s in statuses.values() if not s.ok)

    title_counts = Counter(t for t in scan["titles"].values() if t)
    dup_pages = sum(1 for t in scan["titles"].values() if t and title_counts[t] > 1)

    return {"broken_links": broken, "duplicate_title_pages": dup_pages}


def _expected_ok(expected, actual: int) -> bool:
    if isinstance(expected, dict) and "min" in expected:
        return actual >= expected["min"]
    return actual == expected


def compare_to_manifest(per_page: dict, cross: dict, manifest: dict) -> list[str]:
    """Return a list of human-readable mismatch strings (empty => all matched)."""
    problems: list[str] = []

    for page_name, checks in manifest["audit_page"].items():
        detected = per_page.get(page_name, {})
        for rule_id, expected in checks.items():
            actual = detected.get(rule_id, 0)
            if not _expected_ok(expected, actual):
                problems.append(f"{page_name}: {rule_id} expected {expected}, detected {actual}")

    for key, expected in manifest["cross_page"].items():
        actual = cross.get(key, 0)
        if not _expected_ok(expected, actual):
            problems.append(f"cross_page: {key} expected {expected}, detected {actual}")

    return problems


async def run(base_url: str) -> tuple[bool, list[str], dict, dict]:
    manifest = load_manifest()
    pages = list(manifest["audit_page"].keys()) + ["index.html", "duplicate.html"]
    pages = list(dict.fromkeys(pages))  # dedupe, keep order
    scan = await scan_fixtures(base_url, pages)
    cross = await cross_page_counts(scan)
    sitemap = await asyncio.to_thread(inspect_sitemaps, base_url)
    cross.update({
        "sitemap_missing": sum(f["check_id"] == "sitemap_missing" for f in sitemap.findings),
        "sitemap_malformed": sum(f["check_id"] == "sitemap_malformed" for f in sitemap.findings),
        "page_missing_from_sitemap": 0,
    })
    problems = compare_to_manifest(scan["per_page"], cross, manifest)
    return (not problems, problems, scan["per_page"], cross)


def main() -> None:
    from calibration.serve import serve_fixtures  # local import (repo root on path via caller)

    with serve_fixtures() as base_url:
        ok, problems, per_page, cross = asyncio.run(run(base_url))

    print("=== Detected per-page counts ===")
    for page, counts in per_page.items():
        print(f"  {page}: {counts}")
    print(f"=== Cross-page: {cross} ===")
    if ok:
        print("\n✅ PASS — all detected counts match the manifest.")
        sys.exit(0)
    print("\n❌ FAIL — mismatches:")
    for p in problems:
        print(f"  - {p}")
    sys.exit(1)


if __name__ == "__main__":
    sys.path.insert(0, str(_REPO_ROOT))  # so `from calibration.serve import ...` works
    main()
