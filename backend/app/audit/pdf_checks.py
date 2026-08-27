"""Group D: PDF accessibility checks.

``parse_pdf(bytes)`` extracts a small plain ``PdfInfo`` (metadata + a few
heuristics) with pdfplumber; the D1-D8 checks are pure functions over that, so
they unit-test with hand-built PdfInfo and never need a real file. All findings
are assisted (manual_review) under Accessibility → PDF accessibility — scored
integration is deferred to the calibration phase, same as the other custom a11y
checks.
"""

from __future__ import annotations

import io
import logging
from dataclasses import dataclass, field

logger = logging.getLogger("wcag_scanner.audit.pdf")

_HEADING_SIZE_DELTA = 2.0     # font-size spread below this = "no headings"
_GARBLED_MAX = 0.30          # >30% non-printable in extracted text = suspect order
_MAX_PAGES_SAMPLED = 8       # cap per-PDF work


@dataclass
class PdfInfo:
    pages: int = 0
    title: str | None = None
    lang: str | None = None
    marked: bool | None = None      # None = couldn't tell
    has_bookmarks: bool = False
    has_text: bool = False
    font_size_spread: float = 0.0    # max-min font size across sampled chars
    garbled_ratio: float = 0.0
    # Content volume, for the amount-of-content dashboards. A scanned image with
    # no text layer legitimately counts zero.
    word_count: int = 0
    sentence_count: int = 0
    # Contact details published inside the document.
    phone_numbers: list[str] = field(default_factory=list)
    email_addresses: list[str] = field(default_factory=list)
    error: str | None = None         # set if the file couldn't be parsed


def _unique(values: list[str]) -> list[str]:
    """First occurrence of each value, order preserved, compared case-blind."""
    seen: set[str] = set()
    out: list[str] = []
    for value in values:
        cleaned = value.strip()
        key = cleaned.casefold()
        if cleaned and key not in seen:
            seen.add(key)
            out.append(cleaned)
    return out[:200]


def parse_pdf(data: bytes) -> PdfInfo:
    """Extract accessibility-relevant signals from PDF bytes. Never raises."""
    import pdfplumber
    from pdfminer.pdftypes import resolve1

    info = PdfInfo()
    try:
        with pdfplumber.open(io.BytesIO(data)) as pdf:
            info.pages = len(pdf.pages)

            meta = pdf.metadata or {}
            info.title = (meta.get("Title") or "").strip() or None

            catalog = getattr(pdf.doc, "catalog", {}) or {}
            lang = resolve1(catalog.get("Lang")) if catalog.get("Lang") else None
            if isinstance(lang, bytes):
                lang = lang.decode("latin-1", "ignore")
            info.lang = (lang or "").strip() or None

            mark = resolve1(catalog.get("MarkInfo")) if catalog.get("MarkInfo") else None
            if isinstance(mark, dict):
                info.marked = bool(resolve1(mark.get("Marked")))

            try:
                info.has_bookmarks = any(True for _ in pdf.doc.get_outlines())
            except Exception:
                info.has_bookmarks = False

            text_parts, sizes = [], []
            for page in pdf.pages[:_MAX_PAGES_SAMPLED]:
                try:
                    t = page.extract_text() or ""
                except Exception:
                    t = ""
                if t:
                    text_parts.append(t)
                for ch in (page.chars or [])[:2000]:
                    s = ch.get("size")
                    if isinstance(s, (int, float)):
                        sizes.append(round(float(s), 1))
            text = "\n".join(text_parts)
            info.has_text = bool(text.strip())
            if sizes:
                info.font_size_spread = max(sizes) - min(sizes)
            if text:
                printable = sum(1 for c in text if c.isprintable() or c in "\n\r\t ")
                info.garbled_ratio = 1.0 - (printable / len(text))

                from app.audit.dom_checks import EMAIL_RE, PHONE_RE
                from app.page_pipeline import _sentence_count, _word_count

                info.word_count = _word_count(text)
                info.sentence_count = _sentence_count(text)
                # A document published on the site is public content, so the
                # contact details printed in it are exposed like any other.
                info.phone_numbers = _unique(PHONE_RE.findall(text))
                info.email_addresses = _unique(EMAIL_RE.findall(text))
    except Exception as exc:  # a corrupt/encrypted PDF must not break the scan
        info.error = f"{type(exc).__name__}: {exc}"[:200]
    return info


#: Every check a parsed PDF is graded against. A document's score is the share
#: of these it does not fail.
PDF_CHECK_RULE_IDS: tuple[str, ...] = (
    "pdf_contrast",
    "pdf_heading_order",
    "pdf_no_bookmarks",
    "pdf_no_headings",
    "pdf_no_language",
    "pdf_no_title",
    "pdf_not_tagged",
    "pdf_reading_order",
)

def _rec(rule_id, description, remediation, *, html_snippet=None):
    return {
        "rule_id": rule_id, "category": "accessibility", "subcategory": "PDF accessibility",
        "weight": 1.0, "impact": "minor",
        "description": description, "remediation": remediation, "reference_url": "",
        "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
        "is_best_practice": False, "manual_review": True,  # assisted
        "selector": None, "leaf_selector": None,
        "html_snippet": __import__("json").dumps(html_snippet) if html_snippet is not None else None,
        "wcag_tags": [],
    }


def run_pdf_checks(info: PdfInfo, pdf_url: str) -> list[dict]:
    """D1-D8 for one parsed PDF."""
    if info.error:
        return []
    out: list[dict] = []
    base = {"pdf_url": pdf_url, "pages": info.pages}

    # D1 tagged structure
    if info.marked is not True:
        out.append(_rec("pdf_not_tagged", "PDF is not tagged for accessibility",
                        "Tag the PDF (structure tree) so assistive tech can read it in order.",
                        html_snippet={**base, "marked": info.marked, "has_text": info.has_text}))
    # D2 title
    if not info.title:
        out.append(_rec("pdf_no_title", "PDF has no document title",
                        "Set a descriptive Title in the PDF's document properties.",
                        html_snippet={**base, "title": info.title}))
    # D5 language
    if not info.lang:
        out.append(_rec("pdf_no_language", "PDF does not specify a default language",
                        "Set the document language so screen readers pronounce content correctly.",
                        html_snippet={**base, "lang": info.lang}))
    # D8 bookmarks (long docs)
    if info.pages > 10 and not info.has_bookmarks:
        out.append(_rec("pdf_no_bookmarks", "Long PDF has no bookmarks to aid navigation",
                        "Add bookmarks/outline entries to long PDFs so users can navigate sections.",
                        html_snippet={**base, "has_bookmarks": info.has_bookmarks}))
    # D3 / D4 headings (heuristic on font-size variation)
    if info.has_text and info.font_size_spread < _HEADING_SIZE_DELTA:
        out.append(_rec("pdf_no_headings", "PDF appears to have no headings",
                        "Use tagged headings so the document has a navigable structure.",
                        html_snippet={**base, "font_size_spread": info.font_size_spread}))
    else:
        out.append(_rec("pdf_heading_order", "Review PDF heading order",
                        "Confirm the PDF's headings follow a logical order (H1 → H2 → …).",
                        html_snippet={**base, "font_size_spread": info.font_size_spread}))
    # D7 reading order (empty/garbled text)
    if not info.has_text or info.garbled_ratio > _GARBLED_MAX:
        out.append(_rec("pdf_reading_order", "PDF content may not be in a meaningful sequence",
                        "Ensure the PDF has a tagged reading order; scanned/untagged PDFs read incorrectly.",
                        html_snippet={**base, "has_text": info.has_text, "garbled_ratio": round(info.garbled_ratio, 2)}))
    # D6 contrast (cannot automate — always flag for review)
    out.append(_rec("pdf_contrast", "Review PDF text contrast",
                    "Manually confirm the PDF's text has sufficient contrast against its background.",
                    html_snippet=base))

    # Contact details printed inside a published document are exposed like any
    # other content, so they join the same privacy checks the pages feed.
    if info.phone_numbers:
        out.append({
            **_rec("phone_numbers_exposed",
                   f"{len(info.phone_numbers)} publicly visible phone number(s) in this document",
                   "Confirm publicly exposed phone numbers are intended to be public.",
                   html_snippet={"phone_numbers": info.phone_numbers, "count": len(info.phone_numbers)}),
            "category": "privacy", "subcategory": "Audit",
        })
    if info.email_addresses:
        out.append({
            **_rec("email_addresses_exposed",
                   f"{len(info.email_addresses)} publicly visible email address(es) in this document",
                   "Confirm exposed email addresses are intended to be public.",
                   html_snippet={"email_addresses": info.email_addresses, "count": len(info.email_addresses)}),
            "category": "privacy", "subcategory": "Audit",
        })
    return out
