"""Lightweight Privacy and Policies checks for a single rendered page.

Privacy (scored, modest weight):
  * Strict-Transport-Security response header present
  * a privacy-policy link is discoverable on the page
  * a cookie consent / disclaimer UI is present
  * third-party tracker scripts (informational finding, not a hard failure)

Policies (informational for a single-page instant scan): re-surfaces the
privacy-policy-link and cookie-disclaimer signals at page level, noting that a
site-wide policies audit needs a full crawl.

All wording is original. Findings use the uniform record shape.
"""

from __future__ import annotations

import json

from playwright.async_api import Page

# Pull the DOM signals we need in one round-trip.
_PRIVACY_JS = r"""
() => {
  const links = Array.from(document.querySelectorAll('a[href]'));
  const privacyLink = links.find((a) => {
    const t = (a.textContent || '').toLowerCase();
    const h = (a.getAttribute('href') || '').toLowerCase();
    return /privacy|data protection|gdpr|ccpa/.test(t) || /privacy|gdpr|data-protection/.test(h);
  });
  // Cookie consent banner: known vendor selectors first, then a text heuristic
  // (a visible element mentioning "cookie" together with accept/consent/agree).
  const bannerSel = '#onetrust-banner-sdk,#cookieConsent,[class*="cookie-banner"],[id*="cookie-banner"],'
    + '[class*="cookie-consent"],[id*="cookie-consent"],[class*="cookie-notice"],[class*="cookiebar"],'
    + '[aria-label*="cookie" i],[role="dialog"][aria-label*="cookie" i]';
  let cookieEl = document.querySelector(bannerSel);
  if (!cookieEl) {
    cookieEl = Array.from(document.querySelectorAll('div,section,aside,footer,[role="dialog"],[role="alertdialog"]')).find((el) => {
      const t = (el.innerText || '').toLowerCase();
      return t.includes('cookie') && (t.includes('accept') || t.includes('consent') || t.includes('agree'))
        && t.length < 2000 && el.getBoundingClientRect().height > 0;
    });
  }
  const scripts = Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src') || '');
  return {
    hasPrivacyLink: !!privacyLink,
    privacyHref: privacyLink ? privacyLink.href : null,
    hasCookieUi: !!cookieEl,
    scriptSrcs: scripts,
  };
}
"""

# Host fragments that indicate a third-party tracker / analytics script.
_TRACKERS = {
    "google-analytics.com": "Google Analytics",
    "googletagmanager.com": "Google Tag Manager",
    "doubleclick.net": "Google Ads",
    "facebook.net": "Meta Pixel",
    "connect.facebook": "Meta Pixel",
    "hotjar.com": "Hotjar",
    "segment.com": "Segment",
    "mixpanel.com": "Mixpanel",
    "clarity.ms": "Microsoft Clarity",
    "amplitude.com": "Amplitude",
    "fullstory.com": "FullStory",
    "matomo": "Matomo",
}


def _rec(check_id, category, subcategory, impact, description, remediation, *, manual_review=False, html_snippet=None):
    return {
        "rule_id": check_id, "category": category, "subcategory": subcategory, "weight": 1.0,
        "impact": impact, "description": description, "remediation": remediation, "reference_url": "",
        "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
        "is_best_practice": False, "manual_review": manual_review,
        "selector": None, "leaf_selector": None, "html_snippet": html_snippet, "wcag_tags": [],
    }


def detect_trackers(script_srcs: list[str]) -> list[tuple[str, str]]:
    """(host_fragment, product_name) for each tracker script found. Deduplicated."""
    found: dict[str, str] = {}
    for src in script_srcs:
        low = src.lower()
        for frag, name in _TRACKERS.items():
            if frag in low:
                found[name] = src
    return [(src, name) for name, src in found.items()]


async def run_privacy_checks(page: Page, response_headers: dict) -> list[dict]:
    try:
        data = await page.evaluate(_PRIVACY_JS)
    except Exception:
        return []

    findings: list[dict] = []
    headers_lower = {k.lower(): v for k, v in (response_headers or {}).items()}

    # --- Privacy category ---
    if "strict-transport-security" not in headers_lower:
        findings.append(_rec(
            "hsts", "privacy", "Transport", "moderate",
            "No HTTP Strict Transport Security (HSTS) header",
            "Send a Strict-Transport-Security response header so browsers always connect over HTTPS and "
            "resist protocol-downgrade attacks.",
        ))

    if not data.get("hasPrivacyLink"):
        findings.append(_rec(
            "privacy-policy-link", "privacy", "Disclosure", "serious",
            "No privacy policy link found on the page",
            "Link to a privacy policy from the page (typically in the footer) so visitors can see how "
            "their data is handled.",
        ))

    if not data.get("hasCookieUi"):
        findings.append(_rec(
            "cookie-consent", "privacy", "Consent", "serious",
            "No cookie consent or disclaimer on the page",
            "Add a cookie consent notice/disclaimer to every page. If the site sets non-essential cookies "
            "or loads trackers, obtain consent before they run, as required in many jurisdictions.",
            html_snippet=json.dumps({"banner_detected": False}),
        ))

    trackers = detect_trackers(data.get("scriptSrcs", []))
    for src, name in trackers:
        findings.append(_rec(
            "trackers", "privacy", "Tracking", "minor",
            f"Third-party tracker detected: {name}",
            "Confirm this tracker is disclosed in your privacy policy and gated behind consent where "
            "required. Informational — not counted as a failure.",
            manual_review=True, html_snippet=src[:300],
        ))

    # --- Policies category (page-level view; full audit needs a crawl) ---
    if data.get("hasPrivacyLink"):
        pass  # a present policy link is a pass, no finding
    else:
        findings.append(_rec(
            "policy-privacy", "policies", "Legal", "moderate",
            "Privacy policy not linked from this page",
            "Provide a clear link to your privacy policy. A complete policies audit (terms, accessibility "
            "statement, cookie policy) requires a full-site scan.",
        ))
    if not data.get("hasCookieUi"):
        findings.append(_rec(
            "policy-cookie", "policies", "Legal", "minor",
            "Cookie policy / disclaimer not detected on this page",
            "Add a cookie policy or disclaimer if the site uses cookies. Site-wide policy coverage needs "
            "a full scan.",
            manual_review=True,
        ))

    return findings
