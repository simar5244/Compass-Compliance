"""Pluggable cookie-consent banner dismissal.

A consent overlay can cover the page, intercept the focus order, and skew both
screenshots and accessibility results (e.g. a focus trap on the banner). We try
to dismiss it *before* the stability quiet-period so the post-dismissal DOM is
what we audit and screenshot.

Rules are data, not code — add a `BannerRule` to `RULES` (or pass extras per
scan) to cover a new consent platform. Each rule is tried in order; the first
whose accept button is visible and clickable wins.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from playwright.async_api import Page

logger = logging.getLogger("wcag_scanner.render.cookies")


@dataclass(frozen=True)
class BannerRule:
    name: str
    # CSS selectors for the "accept"/"dismiss" control, tried in order.
    accept_selectors: tuple[str, ...]


RULES: tuple[BannerRule, ...] = (
    BannerRule("OneTrust", ("#onetrust-accept-btn-handler", "#accept-recommended-btn-handler")),
    BannerRule("Cookiebot", ("#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
                             "#CybotCookiebotDialogBodyButtonAccept")),
    BannerRule("Osano", (".osano-cm-accept-all", ".osano-cm-accept")),
    BannerRule("Quantcast", (".qc-cmp2-summary-buttons button[mode='primary']",)),
    BannerRule("TrustArc", ("#truste-consent-button",)),
    BannerRule("CookieYes", (".cky-btn-accept",)),
    BannerRule("Didomi", ("#didomi-notice-agree-button",)),
    BannerRule("Generic", (
        "button#accept-cookies",
        "button[aria-label*='accept' i]",
        "button[title*='accept' i]",
        "[id*='cookie'] button:has-text('Accept')",
        "button:has-text('Accept all')",
        "button:has-text('Accept All')",
        "button:has-text('I accept')",
        "button:has-text('Allow all')",
    )),
)


async def dismiss_cookie_banners(
    page: Page,
    extra_rules: tuple[BannerRule, ...] = (),
    timeout_ms: int = 1500,
) -> str | None:
    """Try each rule's selectors; click the first visible match. Returns the rule name or None."""
    for rule in (*RULES, *extra_rules):
        for selector in rule.accept_selectors:
            try:
                locator = page.locator(selector).first
                if await locator.is_visible(timeout=250):
                    await locator.click(timeout=timeout_ms, no_wait_after=True)
                    logger.info("Dismissed cookie banner via rule %s", rule.name)
                    return rule.name
            except Exception:
                # Selector absent / not clickable / engine quirk — just try the next.
                continue
    return None
