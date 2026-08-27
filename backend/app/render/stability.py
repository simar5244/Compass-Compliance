"""Render-stability protocol for single-page apps.

`networkidle` means the network went quiet — but a React/Angular/LWC app often
keeps mutating the DOM after that (hydration, client-side data binding, lazy
components). Auditing at `networkidle` can catch a half-rendered page. This
protocol waits for the DOM itself to settle:

  1. auto-scroll to the bottom to trigger lazy-loaded / IntersectionObserver
     content, then back to the top,
  2. watch a MutationObserver and resolve once there have been no mutations for
     a quiet window (default 750ms),
  3. give up at a hard ceiling (default 25s) and proceed with whatever rendered
     — a never-settling page (animations, polling) must not stall the crawl.
"""

from __future__ import annotations

from playwright.async_api import Page

_AUTO_SCROLL_JS = r"""
async (step) => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const maxScrolls = 50;  // ceiling so an infinite-growth page can't loop forever
  let last = -1, count = 0;
  while (count < maxScrolls) {
    window.scrollBy(0, step);
    await sleep(100);
    const h = document.body ? document.body.scrollHeight : 0;
    if (h === last) break;   // height stopped growing => bottom reached
    last = h;
    count++;
  }
  window.scrollTo(0, 0);
}
"""

# Resolves when `quietMs` passes with zero mutations, or at `ceilingMs`.
_WAIT_QUIET_JS = r"""
({ quietMs, ceilingMs }) => new Promise((resolve) => {
  let quietTimer = null;
  const start = Date.now();

  const done = (reason) => {
    if (quietTimer) clearTimeout(quietTimer);
    observer.disconnect();
    resolve(reason);
  };

  const armQuiet = () => {
    if (quietTimer) clearTimeout(quietTimer);
    quietTimer = setTimeout(() => done('quiet'), quietMs);
  };

  const observer = new MutationObserver(() => {
    if (Date.now() - start >= ceilingMs) return done('ceiling');
    armQuiet();
  });

  observer.observe(document.documentElement, {
    childList: true, subtree: true, attributes: true, characterData: true,
  });

  setTimeout(() => done('ceiling'), ceilingMs);  // absolute cap
  armQuiet();                                     // start the quiet clock now
})
"""


async def auto_scroll(page: Page, step_px: int = 800) -> None:
    """Scroll to the bottom (triggering lazy content), then back to the top."""
    try:
        await page.evaluate(_AUTO_SCROLL_JS, step_px)
    except Exception:
        # Scrolling is best-effort; a failure here shouldn't abort the page.
        pass


async def wait_until_stable(page: Page, quiet_ms: int = 750, ceiling_ms: int = 25_000) -> str:
    """Wait for the DOM to stop mutating. Returns 'quiet' or 'ceiling' (why it returned)."""
    try:
        return await page.evaluate(_WAIT_QUIET_JS, {"quietMs": quiet_ms, "ceilingMs": ceiling_ms})
    except Exception:
        return "error"
