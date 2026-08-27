"""Regression tests for bbox capture used by the Inspector overlay.

These tests avoid binding local TCP ports (CI sandboxes can forbid it) by using
`page.set_content()` with an inline HTML fixture.
"""

from __future__ import annotations

from pathlib import Path

import pytest

from app.render.capture import bounding_box_for


def _chromium_available() -> bool:
    try:
        from playwright.sync_api import sync_playwright

        with sync_playwright() as p:
            path = p.chromium.executable_path
            if not (bool(path) and Path(path).exists()):
                return False
            try:
                browser = p.chromium.launch()
                browser.close()
                return True
            except Exception:
                return False
    except Exception:
        return False


def test_bbox_js_includes_scroll_offsets():
    # Unit-level guard: the bbox helper must be document-relative (not viewport-relative).
    from app.render import capture

    assert "window.scrollX" in capture._BBOX_JS
    assert "window.scrollY" in capture._BBOX_JS


@pytest.mark.skipif(not _chromium_available(), reason="Playwright Chromium not available/usable")
@pytest.mark.asyncio
async def test_bounding_box_for_is_document_relative():
    from playwright.async_api import async_playwright

    html = """<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { margin: 0; }
      .spacer { height: 2000px; }
      #target { position: absolute; top: 600px; left: 50px; width: 160px; height: 40px; }
    </style>
  </head>
  <body>
    <div class="spacer"></div>
    <div id="target">target</div>
  </body>
</html>"""

    async with async_playwright() as p:
        browser = await p.chromium.launch()
        context = await browser.new_context(viewport={"width": 800, "height": 400})
        page = await context.new_page()
        await page.set_content(html, wait_until="domcontentloaded")

        await page.evaluate("window.scrollTo(0, 500)")
        box = await bounding_box_for(page, "#target")
        assert box is not None
        # target is at y=600 in the document; with scrollY=500 it should render at y=100 in the viewport.
        assert abs(box.y - 600) <= 2

        await context.close()
        await browser.close()
