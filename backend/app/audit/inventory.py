"""Technology inventory — an informational fingerprint of the rendered page.

Info-only: these findings are stored as issues in the `inventory` category but
that category is not scored (see scoring.yaml). They power the report's
Inventory section (name + technology category). Detection is a small, honest
fingerprint table over script srcs, meta generator, and known global objects —
not an exhaustive library.
"""

from __future__ import annotations

from playwright.async_api import Page

_INVENTORY_JS = r"""
() => {
  const gen = document.querySelector('meta[name="generator"]');
  return {
    generator: gen ? gen.getAttribute('content') : null,
    scriptSrcs: Array.from(document.querySelectorAll('script[src]')).map((s) => s.getAttribute('src') || ''),
    globals: {
      React: !!(window.React || document.querySelector('[data-reactroot], #__next, #root ._')),
      Next: !!window.__NEXT_DATA__,
      Vue: !!(window.Vue || document.querySelector('[data-v-app], #app[data-v-app]')),
      Angular: !!(window.ng || document.querySelector('[ng-version]')),
      jQuery: !!window.jQuery,
      Svelte: !!document.querySelector('[class*="svelte-"]'),
      Gatsby: !!document.querySelector('#___gatsby'),
      WordPress: !!document.querySelector('link[href*="wp-content"], meta[name="generator"][content*="WordPress"]'),
      Shopify: !!(window.Shopify),
      Salesforce: !!document.querySelector('[data-aura-rendered-by], .slds-scope'),
    },
  };
}
"""

# script-src host fragment -> (technology name, category)
_SCRIPT_FINGERPRINTS: dict[str, tuple[str, str]] = {
    "jquery": ("jQuery", "JavaScript library"),
    "bootstrap": ("Bootstrap", "UI framework"),
    "cloudflare": ("Cloudflare", "CDN"),
    "jsdelivr": ("jsDelivr", "CDN"),
    "unpkg.com": ("unpkg", "CDN"),
    "gtag/js": ("Google Analytics", "Analytics"),
    "googletagmanager": ("Google Tag Manager", "Tag manager"),
    "hotjar": ("Hotjar", "Analytics"),
    "wp-content": ("WordPress", "CMS"),
    "wp-includes": ("WordPress", "CMS"),
    "shopify": ("Shopify", "E-commerce"),
    "hubspot": ("HubSpot", "Marketing"),
    "stripe.com": ("Stripe", "Payments"),
}

_GLOBAL_CATEGORY = {
    "React": "JavaScript framework", "Next": "React framework", "Vue": "JavaScript framework",
    "Angular": "JavaScript framework", "jQuery": "JavaScript library", "Svelte": "JavaScript framework",
    "Gatsby": "React framework", "WordPress": "CMS", "Shopify": "E-commerce", "Salesforce": "Platform",
}


def _rec(name: str, tech_category: str) -> dict:
    return {
        "rule_id": "technology", "category": "inventory", "subcategory": tech_category, "weight": 1.0,
        "impact": "info",
        "description": f"{name} ({tech_category})",
        "remediation": "", "reference_url": "",
        "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
        "is_best_practice": False, "manual_review": False,
        "selector": None, "leaf_selector": None, "html_snippet": name, "wcag_tags": [],
    }


async def run_inventory(page: Page) -> list[dict]:
    try:
        data = await page.evaluate(_INVENTORY_JS)
    except Exception:
        return []

    detected: dict[str, str] = {}  # name -> category

    if data.get("generator"):
        detected[data["generator"].split()[0]] = "CMS / generator"

    for src in data.get("scriptSrcs", []):
        low = src.lower()
        for frag, (name, cat) in _SCRIPT_FINGERPRINTS.items():
            if frag in low:
                detected.setdefault(name, cat)

    for name, present in (data.get("globals") or {}).items():
        if present:
            detected.setdefault(name, _GLOBAL_CATEGORY.get(name, "Technology"))

    return [_rec(name, cat) for name, cat in detected.items()]
