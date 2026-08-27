"""Render one URL to a stable, audit-ready state — the single code path for
every page, static HTML or SPA alike (static pages just settle instantly).

Flow per URL:
  goto(networkidle) → dismiss cookie banners → auto-scroll → wait for DOM quiet
  → desktop screenshot → shadow-aware link + DOM capture.

The returned `page` is left OPEN at its desktop render state so the caller can
run axe-core and custom checks against the live DOM (never a re-fetch). The
caller owns closing the context. `capture_mobile` is a separate step run AFTER
auditing, since it mutates the viewport.
"""

from __future__ import annotations

import logging
import time
from dataclasses import dataclass, field

from playwright.async_api import BrowserContext, Page

from app.render.capture import MOBILE_VIEWPORT, capture_with_metadata, screenshot_bytes
from app.render.cookie_banners import BannerRule, dismiss_cookie_banners
from app.render.response_context import (
    ConsoleMessage,
    Cookie,
    NetworkRequest,
    ResponseContext,
    registered_domain,
)
from app.render.serialize import extract_anchor_links, extract_links, serialize_dom
from app.render.stability import auto_scroll, wait_until_stable

# Guard rails so a chatty page can't blow up memory during capture.
_MAX_CONSOLE = 200
_MAX_ERRORS = 100
_MAX_REQUESTS = 400

_TTFB_JS = r"""
() => {
  try {
    const n = performance.getEntriesByType('navigation')[0];
    if (n && n.responseStart && n.requestStart) return Math.round(n.responseStart - n.requestStart);
    const t = performance.timing;
    if (t && t.responseStart && t.requestStart) return Math.round(t.responseStart - t.requestStart);
  } catch (e) {}
  return null;
}
"""

logger = logging.getLogger("wcag_scanner.render.worker")

DESKTOP_USER_AGENT = (
    "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"
)


@dataclass
class RenderConfig:
    goto_timeout_ms: int = 30_000
    quiet_ms: int = 750
    stability_ceiling_ms: int = 25_000
    scroll_step_px: int = 800
    dismiss_cookies: bool = True
    extra_cookie_rules: tuple[BannerRule, ...] = ()


@dataclass
class RenderResult:
    url: str
    ok: bool
    page: Page | None = None          # live, open, at desktop state (None if failed)
    status_code: int | None = None
    response_headers: dict = field(default_factory=dict)
    final_url: str | None = None
    links: list[str] = field(default_factory=list)
    anchor_links: list[dict] = field(default_factory=list)  # [{url,text,selector,bbox}, ...]
    serialized_dom: str = ""
    desktop_png: bytes = b""
    desktop_screenshot_meta: dict = field(default_factory=dict)  # css_width/dpr/page dims at capture time
    stability_reason: str = ""        # 'quiet' | 'ceiling' | 'error'
    cookie_rule: str | None = None
    render_ms: int = 0
    attempts: int = 0
    error: str | None = None
    response_context: ResponseContext | None = None  # headers/cookies/console/network/timing


async def _safe_cookies(context: BrowserContext) -> list[Cookie]:
    try:
        raw = await context.cookies()
    except Exception:
        return []
    return [
        Cookie(
            name=c.get("name", ""), domain=c.get("domain", ""), path=c.get("path", "/"),
            secure=bool(c.get("secure")), http_only=bool(c.get("httpOnly")),
            same_site=c.get("sameSite"),
        )
        for c in raw
    ]


async def _safe_ttfb(page: Page) -> int | None:
    try:
        val = await page.evaluate(_TTFB_JS)
    except Exception:
        return None
    return int(val) if isinstance(val, (int, float)) else None


def _build_response_context(
    url, page, response, response_headers, own_domain,
    console_msgs, page_errors, net_requests, *, cookies, ttfb,
) -> ResponseContext:
    final_url = page.url
    return ResponseContext(
        url=url,
        final_url=final_url,
        status_code=response.status if response else None,
        is_https=final_url.lower().startswith("https:"),
        headers={str(k).lower(): v for k, v in (response_headers or {}).items()},
        cookies=cookies,
        console_messages=console_msgs,
        page_errors=page_errors,
        requests=net_requests,
        ttfb_ms=ttfb,
    )


async def render_page(context: BrowserContext, url: str, cfg: RenderConfig | None = None) -> RenderResult:
    """Render ``url`` to a stable state, retrying once on hard failure."""
    cfg = cfg or RenderConfig()
    last_error: str | None = None

    for attempt in (1, 2):
        page = await context.new_page()
        started = time.monotonic()
        # Capture console/errors/network from before navigation starts so the
        # document request and any early logging are included. Accumulators are
        # per-attempt and bounded; a failing handler never breaks the render.
        console_msgs: list[ConsoleMessage] = []
        page_errors: list[str] = []
        net_requests: list[NetworkRequest] = []
        own_domain = registered_domain(url)

        def _on_console(msg):
            if len(console_msgs) >= _MAX_CONSOLE:
                return
            try:
                loc = msg.location or {}
                console_msgs.append(ConsoleMessage(
                    level=msg.type, text=(msg.text or "")[:1000],
                    url=(loc.get("url") or "")[:500], line=int(loc.get("lineNumber") or 0),
                ))
            except Exception:
                pass

        def _on_pageerror(exc):
            if len(page_errors) < _MAX_ERRORS:
                page_errors.append(str(exc)[:1000])

        def _on_response(resp):
            if len(net_requests) >= _MAX_REQUESTS:
                return
            try:
                req = resp.request
                dom = registered_domain(resp.url)
                net_requests.append(NetworkRequest(
                    url=resp.url[:500], domain=dom, resource_type=req.resource_type,
                    method=req.method, status=resp.status,
                    is_external=bool(dom) and dom != own_domain,
                ))
            except Exception:
                pass

        page.on("console", _on_console)
        page.on("pageerror", _on_pageerror)
        page.on("response", _on_response)

        try:
            response = await page.goto(url, wait_until="networkidle", timeout=cfg.goto_timeout_ms)
            try:
                response_headers = dict(await response.all_headers()) if response else {}
            except Exception:
                response_headers = {}

            cookie_rule = None
            if cfg.dismiss_cookies:
                cookie_rule = await dismiss_cookie_banners(page, cfg.extra_cookie_rules)

            await auto_scroll(page, cfg.scroll_step_px)
            reason = await wait_until_stable(page, cfg.quiet_ms, cfg.stability_ceiling_ms)

            # Ensure capture occurs at a stable, document-origin scroll position.
            try:
                await page.evaluate("window.scrollTo(0, 0)")
                await page.wait_for_timeout(300)
            except Exception:
                pass

            shot = await capture_with_metadata(page)
            desktop_png = shot.png
            desktop_screenshot_meta = {
                "css_width": shot.css_width,
                "dpr": shot.dpr,
                "page_width_px": shot.page_width_px,
                "page_height_px": shot.page_height_px,
            }
            links = await extract_links(page)
            anchor_links = await extract_anchor_links(page)
            dom = await serialize_dom(page)

            ctx = _build_response_context(
                url, page, response, response_headers, own_domain,
                console_msgs, page_errors, net_requests,
                cookies=await _safe_cookies(context),
                ttfb=await _safe_ttfb(page),
            )

            return RenderResult(
                url=url,
                ok=True,
                page=page,
                status_code=response.status if response else None,
                response_headers=response_headers,
                final_url=page.url,
                links=links,
                anchor_links=anchor_links,
                serialized_dom=dom,
                desktop_png=desktop_png,
                desktop_screenshot_meta=desktop_screenshot_meta,
                stability_reason=reason,
                cookie_rule=cookie_rule,
                render_ms=int((time.monotonic() - started) * 1000),
                attempts=attempt,
                response_context=ctx,
            )
        except Exception as exc:  # noqa: BLE001 - one bad page must not crash the crawl
            last_error = f"{type(exc).__name__}: {exc}"[:500]
            logger.info("Render attempt %d failed for %s: %s", attempt, url, last_error)
            await page.close()
            # loop retries once; on the second failure we fall through

    return RenderResult(url=url, ok=False, error=last_error, attempts=2)


async def capture_mobile(page: Page, quiet_ms: int = 500) -> bytes:
    """Emulate a 375px viewport, let layout settle, and full-page screenshot.

    Run AFTER auditing — this changes the viewport and would otherwise alter the
    DOM axe sees.
    """
    try:
        await page.set_viewport_size(MOBILE_VIEWPORT)
        await wait_until_stable(page, quiet_ms=quiet_ms, ceiling_ms=5_000)
        return await screenshot_bytes(page, full_page=True)
    except Exception:
        return b""


async def emulate_and_settle(page: Page, width: int, height: int = 900, quiet_ms: int = 500) -> bool:
    """Resize the viewport to ``width`` and re-run the stability wait.

    Responsive JS re-executes on resize, so the DOM at a new width is genuinely
    different from the one just audited — callers must re-measure, not reuse
    prior geometry. Returns True on success."""
    try:
        await page.set_viewport_size({"width": width, "height": height})
        await wait_until_stable(page, quiet_ms=quiet_ms, ceiling_ms=6_000)
        return True
    except Exception:
        return False
