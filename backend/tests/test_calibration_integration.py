"""Integration test: run the real scanner (audit_page + finalize-level checks)
against the calibration fixture site and assert detected counts match the
manifest. Doubles as the end-to-end regression test for all the checks.

Skipped automatically if Chromium isn't installed for Playwright.
"""

from __future__ import annotations

import sys
from pathlib import Path

import pytest

_REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(_REPO_ROOT))

from calibration.check import compare_to_manifest, cross_page_counts, load_manifest, run  # noqa: E402
from calibration.serve import serve_fixtures  # noqa: E402


def _chromium_available() -> bool:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            path = p.chromium.executable_path
            return bool(path) and Path(path).exists()
    except Exception:
        return False


pytestmark = pytest.mark.skipif(not _chromium_available(), reason="Playwright Chromium not installed")


@pytest.mark.asyncio
async def test_fixture_counts_match_manifest():
    with serve_fixtures() as base_url:
        ok, problems, per_page, cross = await run(base_url)
    assert ok, "Detected counts diverged from the manifest:\n" + "\n".join(problems)


@pytest.mark.asyncio
async def test_manifest_is_wellformed():
    manifest = load_manifest()
    assert "audit_page" in manifest and "cross_page" in manifest
    assert "targets.html" in manifest["audit_page"]
    # target-size fixture asserts the exact expected number of flagged targets.
    assert manifest["audit_page"]["targets.html"]["target-size"] == 3
