"""TTU Brand Standards checks for rendered pages."""

from __future__ import annotations

import json
import math
import re

APPROVED_COLORS = ["#CC0000", "#8E001C", "#000000", "#FFFFFF", "#FF6B6B"]
TOLERANCE = 20
APPROVED_FONTS = {"knockout", "palatino linotype", "palatino", "book antiqua", "arial", "helvetica", "helvetica neue", "sans-serif", "serif"}


def color_distance(hex1: str, hex2: str) -> float:
    r1, g1, b1 = int(hex1[1:3], 16), int(hex1[3:5], 16), int(hex1[5:7], 16)
    r2, g2, b2 = int(hex2[1:3], 16), int(hex2[3:5], 16), int(hex2[5:7], 16)
    return ((r1-r2)**2 + (g1-g2)**2 + (b1-b2)**2) ** 0.5


def closest_approved(color: str) -> tuple[str, float]:
    return min(((approved, color_distance(color, approved)) for approved in APPROVED_COLORS), key=lambda x: x[1])


def _record(rule_id: str, subcategory: str, impact: str, description: str, remediation: str, snippet: dict, *, assisted: bool) -> dict:
    return {"rule_id": rule_id, "category": "Brand Standards", "subcategory": subcategory, "weight": 1.0, "impact": impact,
            "description": description, "remediation": remediation, "reference_url": "", "wcag_version": None,
            "wcag_level": None, "criterion_id": None, "criterion_name": None, "is_best_practice": False,
            "manual_review": assisted, "selector": None, "leaf_selector": None, "html_snippet": json.dumps(snippet), "wcag_tags": []}


async def run_ttu_brand_checks(page, rendered_dom=None) -> list[dict]:
    try:
        data = await page.evaluate(r"""() => {
          const selector = (el) => { let n = el; let parts = []; while (n && n.nodeType === 1 && parts.length < 4) { let p = n.tagName.toLowerCase(); if (n.id) p += `#${n.id}`; else if (n.className && typeof n.className === 'string') p += `.${n.className.trim().split(/\s+/).slice(0,2).join('.')}`; parts.unshift(p); n = n.parentElement; } return parts.join(' > '); };
          const prominent = Array.from(document.querySelectorAll('button, nav a, h1, h2, h3, [role="banner"], [role="navigation"]')).slice(0, 200);
          const typography = Array.from(document.querySelectorAll('h1,h2,h3,p,nav a,nav button')).slice(0, 50);
          const buttons = Array.from(document.querySelectorAll('button,a[role="button"],input[type="button"]')).slice(0, 100);
          const color = (v) => { const m = String(v || '').match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i); return m ? [Number(m[1]),Number(m[2]),Number(m[3])] : null; };
          return {
            colors: prominent.map((el) => ({element: el.tagName.toLowerCase(), selector: selector(el), background: color(getComputedStyle(el).backgroundColor), foreground: color(getComputedStyle(el).color)})),
            fonts: typography.map((el) => ({element: el.tagName.toLowerCase(), selector: selector(el), font: getComputedStyle(el).fontFamily, text: (el.textContent || '').trim().slice(0, 120)})),
            logos: Array.from(document.querySelectorAll('img,svg')).map((el) => ({src: el.getAttribute('src') || '', alt: el.getAttribute('alt') || '', cls: el.getAttribute('class') || '', title: el.querySelector?.('title')?.textContent || ''})),
            buttons: buttons.map((el) => { const s = getComputedStyle(el); return {text: (el.textContent || el.value || '').trim().slice(0,100), selector: selector(el), background: s.backgroundColor, color: s.color, border: s.border, radius: s.borderRadius}; }),
            generator: document.querySelector('meta[name="generator"]')?.content || '',
            scripts: Array.from(document.querySelectorAll('script[src]')).map((s) => s.src || ''),
          };
        }""")
    except Exception:
        return []
    out: list[dict] = []
    violations = []
    for item in data.get("colors", []):
        for role in ("background", "foreground"):
            rgb = item.get(role)
            if not rgb:
                continue
            color = "#%02X%02X%02X" % tuple(rgb)
            closest, distance = closest_approved(color)
            if distance > TOLERANCE:
                violations.append({"element": item["element"], "selector": item["selector"], "detected_color": color, "closest_approved": closest, "distance": round(distance, 2)})
    if violations:
        out.append(_record("brand_unapproved_colors", "Colors", "warning", "TTU brand standards specify approved colors. Prominent elements (headers, buttons, navigation) using unapproved colors should be reviewed.", "Replace prominent unapproved colors with the TTU palette or have the design reviewed.", {"violations": violations, "count": len(violations)}, assisted=True))

    font_violations = []
    for item in data.get("fonts", []):
        first = next((f.strip().strip('"\'').lower() for f in item.get("font", "").split(",") if f.strip()), "")
        if first not in APPROVED_FONTS:
            font_violations.append({"element": item["element"], "selector": item["selector"], "detected_font": first, "element_text": item["text"]})
    if font_violations:
        out.append(_record("brand_unapproved_fonts", "Typography", "warning", "TTU brand standards specify approved font families. Headings and body text should use approved fonts only.", "Use an approved TTU font family for headings, body text, and navigation.", {"violations": font_violations}, assisted=True))

    logos = data.get("logos", [])
    found_logo = any("ttu-logo" in x["src"].lower() or "double-t" in x["src"].lower() or "texas-tech-logo" in x["src"].lower() or "ttu_logo" in x["src"].lower() or "texas tech" in x["alt"].lower() or "ttu" in x["alt"].lower() or "double t" in x["alt"].lower() or "texas tech" in x["title"].lower() for x in logos)
    if not found_logo:
        out.append(_record("brand_logo_present", "Logo Usage", "serious", "Every TTU web page must display the official Texas Tech University logo or wordmark.", "Add the official Texas Tech University logo or wordmark to the page header.", {"images_checked": len(logos), "logo_found": False}, assisted=False))

    button_rows = []
    for button in data.get("buttons", []):
        bg = str(button.get("background", "")).replace(" ", "")
        fg = str(button.get("color", "")).replace(" ", "")
        primary = "204,0,0" in bg and ("255,255,255" in fg or "255,255,255" in fg)
        secondary = ("transparent" in bg or "255,255,255" in bg) and "0,0,0" in str(button.get("border", "")).replace(" ", "")
        button_rows.append({**button, "matches_pattern": "primary" if primary else "secondary" if secondary else "unknown"})
    if any(x["matches_pattern"] == "unknown" for x in button_rows):
        out.append(_record("brand_button_consistency", "Buttons & Components", "info", "Primary buttons should use Matador Red (#CC0000) background. Secondary buttons should use outlined style with dark border. Review buttons using other color schemes.", "Use Matador Red with white text for primary buttons and a transparent/white outlined treatment for secondary buttons.", {"buttons": button_rows}, assisted=True))

    generator = str(data.get("generator", ""))
    scripts = " ".join(str(src) for src in data.get("scripts", []))
    cms = None
    if re.search(r"cascade", f"{generator} {scripts}", re.I):
        cms = "Cascade CMS"
    elif re.search(r"wordpress|wp-content|wp-includes", f"{generator} {scripts}", re.I):
        cms = "WordPress"
    elif re.search(r"drupal", f"{generator} {scripts}", re.I):
        cms = "Drupal"
    if cms:
        instructions = {
            "Cascade CMS": "To fix brand colors in Cascade CMS: 1. Log in at cascade.ttu.edu 2. Navigate to the page using the asset tree 3. Click Edit → select the region with the issue 4. Use the Style dropdown to select approved TTU styles 5. Do not use inline style attributes",
            "WordPress": "To fix brand colors in WordPress: 1. Log in to wp-admin 2. Navigate to Appearance → Customize → Colors 3. Ensure primary color is set to #CC0000 4. For individual pages: use the block editor's color settings and select from the TTU color palette",
            "Drupal": "To fix brand issues in Drupal: 1. Log in and navigate to the content 2. Use the approved TTU theme components 3. Contact your web administrator to update theme settings",
        }[cms]
        out.append(_record("brand_cms_detected", "CMS Integration", "info", "A content management system was detected on this page. Brand compliance fixes can be made directly in the CMS without editing code.", instructions, {"cms_detected": cms, "cms_version": None, "fix_instructions": instructions}, assisted=True))

    return out
