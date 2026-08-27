"""TTU emergency-information checks."""

from __future__ import annotations

import json
import re


def _record(rule_id: str, subcategory: str, impact: str, description: str, remediation: str, snippet: dict) -> dict:
    return {"rule_id": rule_id, "category": "TTU Compliance", "subcategory": subcategory, "weight": 1.0,
            "impact": impact, "description": description, "remediation": remediation, "reference_url": "",
            "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
            "is_best_practice": False, "manual_review": False, "selector": None, "leaf_selector": None,
            "html_snippet": json.dumps(snippet), "wcag_tags": []}


async def run_ttu_emergency_checks(page, rendered_dom=None) -> list[dict]:
    try:
        data = await page.evaluate(r"""() => ({
          links: Array.from(document.querySelectorAll('a[href]')).map((a) => ({href: a.href || '', text: a.textContent || ''})),
          widgets: Array.from(document.querySelectorAll('[class],[id]')).some((el) => /ttu-alert|emergency-banner|alert-bar/i.test(`${el.className || ''} ${el.id || ''}`)),
          text: document.body ? (document.body.innerText || '') : ''
        })""")
    except Exception:
        return []
    links = data.get("links") or []
    matching = [x for x in links if re.search(r"emergency|safety|alert", f"{x.get('href', '')} {x.get('text', '')}", re.I)]
    if not matching and not data.get("widgets"):
        info = _record("emergency_info_linked", "Emergency Info", "warning",
            "Texas universities must make emergency procedures readily accessible. Every page should link to TTU's emergency information resources.",
            "Link every page to TTU emergency procedures or display the TTU Alert widget.", {"links_found": [], "has_alert_widget": False})
    else:
        info = None
    text = str(data.get("text", ""))
    police = bool(re.search(r"806[\s.-]?742[\s.-]?3931", text))
    nine11 = bool(re.search(r"\b911\b", text))
    emergency_link = bool(matching)
    contact = None
    if not (police or nine11 or emergency_link):
        contact = _record("emergency_contact_present", "Emergency Info", "warning",
            "TTU Police (806-742-3931) and campus emergency contacts should be accessible from every page or clearly linked.",
            "Add TTU Police, 911, or a clear link to the campus emergency contacts page.",
            {"ttu_police_found": police, "nine11_found": nine11, "emergency_link_found": emergency_link})
    return [x for x in (info, contact) if x is not None]
