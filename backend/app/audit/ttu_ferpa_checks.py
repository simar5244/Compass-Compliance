"""Texas Tech FERPA exposure checks."""

from __future__ import annotations

import json
import re

R_NUMBER_RE = re.compile(r"\bR\d{8}(?!\d)\b")
GENERIC_ID_RE = re.compile(r"\b\d{9}\b")
DIRECTORY_PAGE_RE = re.compile(r"/(?:directory|students?|honor|scholarship|staff|faculty|people)(?:/|$)", re.I)


def _record(rule_id: str, impact: str, description: str, remediation: str, snippet: dict, *, assisted: bool = True) -> dict:
    return {"rule_id": rule_id, "category": "TTU Compliance", "subcategory": "FERPA", "weight": 1.0,
            "impact": impact, "description": description, "remediation": remediation, "reference_url": "",
            "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
            "is_best_practice": False, "manual_review": assisted, "selector": None, "leaf_selector": None,
            "html_snippet": json.dumps(snippet), "wcag_tags": []}


def _contexts(text: str, regex: re.Pattern[str], pattern_type: str) -> list[dict]:
    return [{"pattern_type": pattern_type, "context": text[max(0, m.start() - 100):m.end() + 100], "selector": None} for m in regex.finditer(text)]


def detect_r_number_exposure(text: str) -> list[dict]:
    """Find exact TTU R-numbers and generic nine-digit identifiers in text."""
    text = text or ""
    scrubbed = re.sub(r"https?://\S+|www\.\S+", " ", text)
    scrubbed = re.sub(r"(?is)<(script|code)\b.*?</\1>", " ", scrubbed)
    return _contexts(scrubbed, R_NUMBER_RE, "ttu_r_number") + _contexts(scrubbed, GENERIC_ID_RE, "generic_9_digit")


async def run_ttu_ferpa_checks(page, rendered_dom=None) -> list[dict]:
    try:
        data = await page.evaluate(r"""() => ({
          text: document.body ? (document.body.innerText || '') : '',
          html: document.body ? (document.body.innerHTML || '') : '',
          url: location.href,
          hasAuth: !!document.querySelector('form[action*="login" i], input[type="password"], [aria-label*="login" i]')
        })""")
    except Exception:
        return []
    text = str(data.get("text", ""))
    out: list[dict] = []
    matches = detect_r_number_exposure(text)
    if matches:
        out.append(_record("ferpa_student_id_exposure", "error",
            "FERPA prohibits public display of student education records including student ID numbers. TTU student IDs follow the pattern R + 8 digits (e.g. R12345678).",
            "Remove exposed student identifiers or place the records behind authentication and have TTU privacy counsel review the page.",
            {"matches": matches, "count": len(matches)}))

    indicators = [p for p in ("GPA", "grade point", "transcript", "academic record", "passed", "failed", "incomplete") if re.search(rf"\b{re.escape(p)}\b", text, re.I)]
    nearby_identity = bool(R_NUMBER_RE.search(text) or re.search(r"\b[A-Z][a-z]+\s+[A-Z][a-z]+\b", text))
    if not data.get("hasAuth") and indicators and nearby_identity:
        out.append(_record("ferpa_grade_exposure", "error",
            "Pages that appear to display individual student grades or academic records publicly may violate FERPA. These pages should be behind authentication.",
            "Verify that academic records are authenticated and remove any public student-specific data.",
            {"patterns_found": indicators, "page_has_auth": False}))

    directory_patterns = [p for p in ("major", "degree", "GPA", "graduation", "enrollment", "honor roll", "scholarship") if re.search(rf"\b{re.escape(p)}\b", text, re.I)]
    # A single academic term is common on ordinary university pages. Require
    # multiple signals and a page whose URL identifies a people/listing area
    # before treating it as possible directory information.
    if len(directory_patterns) >= 2 and DIRECTORY_PAGE_RE.search(str(data.get("url", ""))):
        out.append(_record("ferpa_directory_information", "warning",
            "FERPA allows institutions to designate certain information as directory information (name, major, enrollment status). However, students may opt out of directory information disclosure. Review pages that list student names alongside academic information.",
            "Review the page against TTU's directory-information designation and opt-out requirements.",
            {"page_type_detected": "student_directory" if "/directory" in str(data.get("url", "")).lower() else "academic_listing", "patterns": directory_patterns}))
    return out
