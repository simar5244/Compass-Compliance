"""Screenshots and element geometry for the issue-overlay UI.

The frontend overlays each issue on the page screenshot, so for every issue we
need a bounding box in the same coordinate space as the screenshot it's drawn
on. Full-page screenshots use CSS pixels from the document origin, which is
exactly what `getBoundingClientRect()` + scroll offset gives us.
"""

from __future__ import annotations

from dataclasses import dataclass

from playwright.async_api import Page

DESKTOP_VIEWPORT = {"width": 1440, "height": 900}
MOBILE_VIEWPORT = {"width": 375, "height": 812}


@dataclass(frozen=True)
class BBox:
    x: float
    y: float
    width: float
    height: float


@dataclass(frozen=True)
class Screenshot:
    """A screenshot plus the geometry the overlay UI needs to place boxes.

    Overlay scaling = displayed_image_width / css_width. Because a full-page
    screenshot's pixel width == css_width * dpr, and bboxes are stored in CSS
    px, the frontend only needs css_width to scale correctly."""
    png: bytes
    css_width: float       # CSS px width of the viewport at capture time
    dpr: float             # devicePixelRatio
    page_width_px: float   # full document width in CSS px
    page_height_px: float  # full document height in CSS px


_METRICS_JS = r"""
() => ({
  css_width: window.innerWidth,
  dpr: window.devicePixelRatio || 1,
  page_width_px: document.documentElement.scrollWidth,
  page_height_px: document.documentElement.scrollHeight,
})
"""


async def screenshot_bytes(page: Page, full_page: bool = True) -> bytes:
    """Full-page PNG of the current render. Never raises — returns b'' on failure."""
    try:
        return await page.screenshot(full_page=full_page, type="png", timeout=15_000)
    except Exception:
        return b""


async def page_metrics(page: Page) -> dict:
    """Capture geometry (css_width, dpr, page dims) without taking a screenshot."""
    try:
        return await page.evaluate(_METRICS_JS)
    except Exception:
        return {"css_width": 0, "dpr": 1, "page_width_px": 0, "page_height_px": 0}


async def capture_with_metadata(page: Page) -> Screenshot:
    """Full-page screenshot plus capture geometry for pixel-accurate overlays."""
    png = await screenshot_bytes(page, full_page=True)
    try:
        m = await page.evaluate(_METRICS_JS)
    except Exception:
        m = {"css_width": 0, "dpr": 1, "page_width_px": 0, "page_height_px": 0}
    return Screenshot(
        png=png, css_width=float(m["css_width"]), dpr=float(m["dpr"]),
        page_width_px=float(m["page_width_px"]), page_height_px=float(m["page_height_px"]),
    )


# Resolve a CSS selector to a document-space box (viewport rect + scroll offset).
# Shadow-piercing axe targets arrive as the LAST segment here; a best-effort
# light-DOM lookup covers the common case and returns null otherwise.
_BBOX_JS = r"""
(selector) => {
  let el = null;
  try { el = document.querySelector(selector); } catch { return null; }
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return null;
  return {
    x: r.x + window.scrollX,
    y: r.y + window.scrollY,
    width: r.width,
    height: r.height,
  };
}
"""


async def bounding_box_for(page: Page, selector: str) -> BBox | None:
    """Document-space box for the first element matching ``selector``, or None."""
    try:
        raw = await page.evaluate(_BBOX_JS, selector)
    except Exception:
        return None
    if not raw:
        return None
    return BBox(x=raw["x"], y=raw["y"], width=raw["width"], height=raw["height"])
