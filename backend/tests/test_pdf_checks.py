"""Group D PDF accessibility checks.

Fixtures are REAL PDFs generated with pypdf (no mocking of pdfplumber internals) —
so parse_pdf exercises the actual pdfplumber/pdfminer read path.
"""

import io

from pypdf import PdfWriter
from pypdf.generic import BooleanObject, DictionaryObject, NameObject, TextStringObject

from app.audit.pdf_checks import parse_pdf, run_pdf_checks


def make_pdf(pages: int = 1, title: str | None = None, lang: str | None = None,
             marked: bool = False, outline: bool = False) -> bytes:
    w = PdfWriter()
    for _ in range(pages):
        w.add_blank_page(width=200, height=200)
    if title:
        w.add_metadata({"/Title": title})
    if lang:
        w._root_object[NameObject("/Lang")] = TextStringObject(lang)
    if marked:
        mi = DictionaryObject()
        mi[NameObject("/Marked")] = BooleanObject(True)
        w._root_object[NameObject("/MarkInfo")] = mi
    if outline:
        w.add_outline_item("Section 1", 0)
    buf = io.BytesIO()
    w.write(buf)
    return buf.getvalue()


def _fired(pdf_bytes: bytes) -> set[str]:
    recs = run_pdf_checks(parse_pdf(pdf_bytes), "http://x/doc.pdf")
    assert all(r["manual_review"] for r in recs)          # every PDF check is assisted
    assert all(r["category"] == "accessibility" for r in recs)
    return {r["rule_id"] for r in recs}


# --- D1: tagged (/Marked) -----------------------------------------------

def test_d1_not_tagged_fires_when_markinfo_absent():
    assert "pdf_not_tagged" in _fired(make_pdf())


def test_d1_passes_when_marked_true():
    assert "pdf_not_tagged" not in _fired(make_pdf(marked=True))


# --- D2: title -----------------------------------------------------------

def test_d2_no_title_fires_when_title_absent():
    assert "pdf_no_title" in _fired(make_pdf())


def test_d2_passes_when_title_present():
    assert "pdf_no_title" not in _fired(make_pdf(title="Annual Report"))


# --- D5: language --------------------------------------------------------

def test_d5_no_language_fires_when_lang_absent():
    assert "pdf_no_language" in _fired(make_pdf())


def test_d5_passes_when_lang_present():
    assert "pdf_no_language" not in _fired(make_pdf(lang="en-US"))


# --- D8: bookmarks on long docs -----------------------------------------

def test_d8_no_bookmarks_fires_when_long_and_no_outline():
    assert "pdf_no_bookmarks" in _fired(make_pdf(pages=12))


def test_d8_passes_when_outline_present():
    assert "pdf_no_bookmarks" not in _fired(make_pdf(pages=12, outline=True))


def test_d8_does_not_fire_for_short_docs():
    assert "pdf_no_bookmarks" not in _fired(make_pdf(pages=3))


# --- fully-compliant document -------------------------------------------

def test_compliant_pdf_clears_metadata_checks():
    fired = _fired(make_pdf(pages=12, title="Doc", lang="en-US", marked=True, outline=True))
    assert {"pdf_not_tagged", "pdf_no_title", "pdf_no_language", "pdf_no_bookmarks"} & fired == set()


# --- robustness ----------------------------------------------------------

def test_corrupt_pdf_is_safe_and_yields_no_findings():
    info = parse_pdf(b"%PDF-1.4 not really a pdf")
    assert info.error is not None
    assert run_pdf_checks(info, "http://x/broken.pdf") == []
