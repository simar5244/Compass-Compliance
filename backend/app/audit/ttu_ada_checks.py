"""Texas Tech ADA / Section 508 checks for rendered pages."""

from __future__ import annotations

import json
import re
from typing import Any


def _record(rule_id: str, subcategory: str, impact: str, description: str, remediation: str, *, assisted: bool, snippet: Any, selector: str | None = None) -> dict:
    return {
        "rule_id": rule_id, "category": "TTU Compliance", "subcategory": subcategory,
        "weight": 1.0, "impact": impact, "description": description,
        "remediation": remediation, "reference_url": "", "wcag_version": None,
        "wcag_level": None, "criterion_id": None, "criterion_name": None,
        "is_best_practice": False, "manual_review": assisted, "selector": selector,
        "leaf_selector": None, "html_snippet": json.dumps(snippet), "wcag_tags": [],
    }


async def run_ttu_ada_checks(page, rendered_dom=None, response_context=None) -> list[dict]:
    """Run ADA checks from one rendered DOM; all browser failures are isolated."""
    try:
        data = await page.evaluate(r"""() => {
          const links = Array.from(document.querySelectorAll('a[href]'));
          const matches = links.filter((a) => {
            const href = a.getAttribute('href') || '';
            const text = a.textContent || '';
            return /accessibility|ada|disability/i.test(href) || /accessibility|ada|accessible/i.test(text);
          });
          const footer = document.querySelector('footer');
          const footerLinks = footer ? Array.from(footer.querySelectorAll('a[href]')) : [];
          const visibleText = document.body ? (document.body.innerText || '') : '';
          const hasPdf = !!document.querySelector('a[href$=".pdf" i], embed[type="application/pdf"], iframe[src$=".pdf" i]');
          const hasDownload = !!document.querySelector('a[download], a[href*="download" i]');
          return {
            statement: matches.length > 0 || footerLinks.some((a) => /accessibility|ada|disability/i.test(a.href || '') || /accessibility|ada|accessible/i.test(a.textContent || '')),
            linksChecked: links.length, footerChecked: !!footer,
            text: visibleText, hasPdfs: hasPdf, hasDownloads: hasDownload,
            url: location.href,
          };
        }""")
    except Exception:
        return []

    out: list[dict] = []
    if not data.get("statement"):
        out.append(_record(
            "accessibility_statement_present", "ADA / Section 508", "serious",
            "Texas Administrative Code requires all state agency and public university websites to include a link to an accessibility statement on every page. The statement must include contact information for requesting alternative formats.",
            "Add a link to TTU's accessibility statement on every page, including contact information for requesting alternative formats.",
            assisted=False,
            snippet={"links_checked": data.get("linksChecked", 0), "footer_checked": bool(data.get("footerChecked")), "found": False},
        ))

    if re.search(r"/accessibility|/ada|/disability", str(data.get("url", "")), re.I):
        text = str(data.get("text", ""))
        has_phone = bool(re.search(r"(?:\+?1[\s.-]?)?(?:\(?\d{3}\)?[\s.-])\d{3}[\s.-]\d{4}", text))
        has_email = bool(re.search(r"\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b", text))
        if not (has_phone or has_email):
            out.append(_record(
                "accessibility_statement_contact", "ADA / Section 508", "warning",
                "The accessibility statement must include a name, phone number, or email address for users to request alternative formats or report accessibility barriers.",
                "Review the accessibility statement with TTU's accessibility team and add a clear contact method.",
                assisted=True, snippet={"page_url": data.get("url", ""), "has_phone": has_phone, "has_email": has_email},
            ))

    text = str(data.get("text", ""))
    patterns = [p for p in ("alternative format", "request format", "accessible format", "disability services", "accommodation") if re.search(p, text, re.I)]
    if (data.get("hasPdfs") or data.get("hasDownloads")) and not patterns:
        out.append(_record(
            "alternative_format_process", "ADA / Section 508", "warning",
            "Texas higher education institutions must provide a clear process for students to request content in alternative formats (large print, audio, braille, etc.).",
            "Add a clear alternative-format request process and verify it with TTU disability services.",
            assisted=True, snippet={"has_pdfs": bool(data.get("hasPdfs")), "has_downloads": bool(data.get("hasDownloads")), "patterns_found": patterns},
        ))
    return out
