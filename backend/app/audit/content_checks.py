"""Content / quality checks that run on the rendered DOM (Silktide-style
categories beyond accessibility): Writing (spelling, readability), SEO
(title, meta description), and UX (alt text, heading order).

These run on the LIVE rendered page — the same render the accessibility audit
used — so JS-injected copy and components are included. Broken-link checking
lives in `app.audit.links` (it needs network IO, not the DOM) and duplicate
title/meta detection is cross-page, so it happens in the scan engine's finalize.

Each check returns finding dicts shaped for `Issue` rows + the scoring engine:
    {check_id, category, subcategory, impact, description, remediation,
     selector, html_snippet, weight}
`weight` supports per-issue sub-weighting (e.g. a low-confidence spelling flag
counts less than a clear one).
"""

from __future__ import annotations

import json
import re
from functools import lru_cache

from playwright.async_api import Page
from spellchecker import SpellChecker

from app.audit.grammar_checks import GrammarChecker

# Pull the signals we need out of the rendered DOM in one round-trip.
_EXTRACT_JS = r"""
() => {
  const selectorFor = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 7) {
      const tag = current.tagName.toLowerCase();
      const siblings = current.parentElement
        ? Array.from(current.parentElement.children).filter((item) => item.tagName === current.tagName)
        : [];
      const suffix = siblings.length > 1 ? `:nth-of-type(${siblings.indexOf(current) + 1})` : '';
      parts.unshift(`${tag}${suffix}`);
      current = current.parentElement;
    }
    return `body > ${parts.join(' > ')}`;
  };
  const text = document.body ? document.body.innerText : '';
  const title = (document.title || '').trim();
  const metaEl = document.querySelector('meta[name="description"]');
  const metaDescription = metaEl ? (metaEl.getAttribute('content') || '').trim() : null;

  // Grammar sources. `mainText` is the visible body with chrome removed so it
  // doesn't double-count navigation copy (that has its own source). `navText`
  // and `altTexts` cover the invisible/structural text Silktide also checks.
  let mainText = '';
  if (document.body) {
    const clone = document.body.cloneNode(true);
    clone.querySelectorAll('nav, header, footer, aside, script, style, noscript, svg title, svg desc, [hidden], [role="navigation"], [role="banner"], [role="contentinfo"]')
      .forEach((el) => el.remove());
    // A detached clone has no layout, so innerText silently degrades to
    // textContent and runs the last word of one block into the first of the
    // next ("Contact an Advisor" + "Our advisors" => "AdvisorOur"). Grammar
    // then reports those joins as repeated words and missing sentence spaces,
    // so the block boundaries are put back explicitly.
    // SVG <title>/<desc> are accessible names, never rendered as page copy, but
    // textContent pulls them in and runs them together ("News for News" twice
    // => "News for NewsNews for News"), which reads as phrase repetition.
    clone.querySelectorAll('br').forEach((el) => el.replaceWith(document.createTextNode('\n')));
    clone.querySelectorAll(
      'p,div,li,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,blockquote,figcaption,dt,dd,pre,ul,ol,table,form,label,option'
    ).forEach((el) => el.appendChild(document.createTextNode('\n\n')));
    mainText = (clone.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  const navText = Array.from(document.querySelectorAll('nav, [role="navigation"]'))
    .map((n) => (n.innerText || n.textContent || '').trim())
    .filter(Boolean).join('. ');
  const altTexts = Array.from(document.querySelectorAll('img[alt]'))
    .map((img) => (img.getAttribute('alt') || '').trim())
    .filter(Boolean).join('. ');

  const images = Array.from(document.querySelectorAll('img')).map((img) => {
    const alt = img.getAttribute('alt');
    return {
      hasAlt: alt !== null,
      isEmptyAlt: alt !== null && alt.trim() === '',
      isDecorative: img.getAttribute('role') === 'presentation' || img.getAttribute('aria-hidden') === 'true',
      src: (img.getAttribute('src') || '').slice(0, 300),
      alt: alt || '',
      selector: selectorFor(img),
      html: img.outerHTML.slice(0, 1000),
    };
  });

  const headings = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6')).map((h) => ({
    level: parseInt(h.tagName.substring(1), 10),
    text: (h.textContent || '').trim().slice(0, 120),
    selector: selectorFor(h),
    html: h.outerHTML.slice(0, 1000),
  }));

  return { text, title, metaDescription, images, headings, mainText, navText, altTexts };
}
"""

_WORD_RE = re.compile(r"[A-Za-z][A-Za-z'\-]{3,}")


@lru_cache(maxsize=1)
def _spell() -> SpellChecker:
    return SpellChecker(distance=1)  # distance=1 keeps it fast on large pages


async def extract_content(page: Page) -> dict:
    """Rendered-DOM signals for the content checks. Never raises."""
    try:
        return await page.evaluate(_EXTRACT_JS)
    except Exception:
        return {"text": "", "title": "", "metaDescription": None, "images": [], "headings": [],
                "mainText": "", "navText": "", "altTexts": ""}


def _finding(check_id, category, subcategory, impact, description, remediation, *,
             selector=None, html_snippet=None, weight=1.0, criterion=None) -> dict:
    """``criterion`` is (version, level, id, name) for findings that map to WCAG."""
    return {
        "check_id": check_id, "category": category, "subcategory": subcategory,
        "impact": impact, "description": description, "remediation": remediation,
        "selector": selector, "html_snippet": html_snippet, "weight": weight,
        "criterion": criterion,
    }


def check_images_alt(images: list[dict]) -> list[dict]:
    findings = []
    for img in images:
        if not img["hasAlt"] and not img["isDecorative"]:
            findings.append(_finding(
                "image-alt-content", "content", "Images", "serious",
                "Image is missing an alt attribute",
                "Add an alt attribute describing the image's meaning, or mark it decorative "
                "(empty alt / presentation role) if it carries none.",
                selector=img["selector"], html_snippet=img.get("html") or f'<img src="{img["src"]}">',
            ))
            continue
        alt = (img.get("alt") or "").strip()
        low = alt.lower()
        looks_like_filename = bool(re.search(r"\.(?:jpe?g|png|gif|webp|svg)$", low))
        generic = low in {"image", "photo", "picture", "graphic", "icon"}
        if alt and (len(alt) > 150 or looks_like_filename or generic):
            findings.append(_finding(
                "image-alt-content", "content", "Images", "moderate",
                "Image alternative text may not describe its purpose",
                "Replace generic, filename-like, or overly long alternative text with a concise description "
                "of the image's purpose in context.",
                selector=img["selector"], html_snippet=img.get("html") or alt,
            ))
    return findings


def check_decorative_images(images: list[dict]) -> list[dict]:
    """Decorative intent is contextual, so surface candidates for review."""
    out = []
    for img in images:
        if img.get("isEmptyAlt") or img.get("isDecorative"):
            out.append(_finding(
                "decorative_images_review", "content", "Images", "minor",
                "Image is marked as decorative",
                "Confirm this image conveys no information. If it is meaningful, provide appropriate "
                "alternative text and remove presentation/hidden semantics.",
                selector=img.get("selector"),
                html_snippet=img.get("html") or f'<img src="{img.get("src", "")}" alt="{img.get("alt", "")}">',
            ) | {"manual_review": True})
    return out


def check_heading_order(headings: list[dict]) -> list[dict]:
    """Flag a skipped heading level (e.g. h2 → h4) and a missing single h1."""
    findings = []
    h1_count = sum(1 for h in headings if h["level"] == 1)
    if headings and h1_count == 0:
        findings.append(_finding(
            "heading-order-content", "ux", "Structure", "moderate",
            "Page has no top-level heading (h1)",
            "Give the page a single h1 that names its main topic, then nest lower levels in order.",
        ))
    prev = None
    for h in headings:
        if prev is not None and h["level"] > prev + 1:
            findings.append(_finding(
                "heading-order-content", "ux", "Structure", "moderate",
                f"Heading level jumps from h{prev} to h{h['level']}",
                "Don't skip heading levels — increase by one at a time so the outline stays logical.",
                html_snippet=f"h{h['level']}: {h['text']}",
            ))
        prev = h["level"]
    return findings


def check_readability(text: str) -> list[dict]:
    """Flag hard-to-read pages via Flesch Reading Ease (higher = easier)."""
    words = _WORD_RE.findall(text)
    if len(words) < 120:  # too little prose to score meaningfully
        return []
    try:
        import textstat
        score = textstat.flesch_reading_ease(text)
    except Exception:
        return []
    # < 30 = very difficult, 30-50 = difficult. Weight scales with how hard.
    if score < 30:
        weight = 1.0
    elif score < 50:
        weight = 0.5
    else:
        return []
    return [_finding(
        "readability", "content", "Writing", "minor",
        f"Content is hard to read (Flesch reading ease {round(score)})",
        "Shorten sentences and prefer simpler words to raise the reading-ease score; aim for 60+ "
        "for a general audience.",
        weight=weight,
    )]


# Reading Level (WCAG 2.0 AAA 3.1.5): content must not demand reading ability beyond
# lower secondary education, i.e. roughly a US grade-9 reading level. This is a
# pass/fail criterion, unlike `readability`, which is graded advice about tone.
_LOWER_SECONDARY_GRADE = 9.0


def check_reading_level(text: str) -> list[dict]:
    words = _WORD_RE.findall(text)
    if len(words) < 120:  # too little prose to grade meaningfully
        return []
    try:
        import textstat
        grade = float(textstat.flesch_kincaid_grade(text))
    except Exception:
        return []
    if grade <= _LOWER_SECONDARY_GRADE:
        return []
    return [_finding(
        "reading_level_aaa", "content", "Writing", "minor",
        f"Content reads at about US grade {round(grade, 1)}, above lower secondary level",
        "Rewrite the hardest passages in shorter sentences and plainer words, or provide a "
        "simplified version, so the text does not require more than a lower secondary "
        "education to read.",
        criterion=("2.0", "AAA", "3.1.5", "Reading Level"),
    )]


# --------------------------------------------------------------------------- #
# Spelling
# --------------------------------------------------------------------------- #
#: Words are graded into these buckets, mirroring how a reviewer triages them.
SPELLING_LIKELY = "likely"
SPELLING_POTENTIAL = "potential"
SPELLING_LANGUAGE = "different_language"
SPELLING_CASE = "incorrect_case"

#: Non-English dictionaries consulted before calling a word a misspelling, so a
#: Spanish page section is reported as another language rather than 400 errors.
# Portuguese is deliberately absent: its bundled dictionary is nearly five times
# the size of the others and mislabels English typos as valid Portuguese. A word
# we cannot place confidently falls to 'potential' rather than a wrong language.
_OTHER_LANGUAGES = {"es": "Spanish", "fr": "French", "de": "German"}

#: Tokens keep internal hyphens and apostrophes so line-break artefacts such as
#: "attach-ments" surface as their own word rather than two valid halves.
_SPELL_TOKEN_RE = re.compile(r"[A-Za-z][A-Za-z'\-]{2,}[A-Za-z]")


@lru_cache(maxsize=8)
def _spell_for(language: str) -> SpellChecker | None:
    try:
        return SpellChecker(language=language, distance=1)
    except Exception:
        return None


def _known_en(word: str) -> bool:
    speller = _spell()
    lowered = word.lower()
    return bool(speller.known([lowered])) or bool(speller.known([word]))


#: A capitalised word needs to be this long before we will call it a misspelling
#: rather than a name. Surnames and place names ("Childress", "Culberson") sit at
#: 9 characters and a dictionary cannot tell them from a typo, so the bar is set
#: above them; shorter capitalised words still qualify via the transposition test.
_MIN_TITLECASE_LIKELY = 10

_SUFFIXES = ("s", "es", "ed", "ing", "ly", "er", "ers", "'s")


def _morphology_known(word: str) -> bool:
    """True when the word is an inflection of a known word ("biomes", "journaling")."""
    lowered = word.lower()
    for suffix in _SUFFIXES:
        if not lowered.endswith(suffix) or len(lowered) - len(suffix) < 3:
            continue
        stem = lowered[: -len(suffix)]
        if _known_en(stem) or _known_en(stem + "e") or (stem and _known_en(stem[:-1])):
            return True
    if lowered.endswith("ies") and _known_en(lowered[:-3] + "y"):
        return True
    return False


#: A word clipped with an apostrophe near its end: Gov't, Ass'n, ref'd.
_APOSTROPHE_ABBREVIATION_RE = re.compile(r"[A-Za-z]{2,}'[A-Za-z]{1,2}")


def _looks_like_name(token: str) -> bool:
    """CamelCase, mixed digits/caps and brand-shaped tokens are names, not typos."""
    body = token.strip("'-")
    if not body:
        return False
    inner = body[1:]
    return any(c.isupper() for c in inner) or any(c.isdigit() for c in body)


def classify_spelling(token: str, custom: set[str]) -> tuple[str, str | None, str | None] | None:
    """Return (category, suggestion, language) for a suspect token, or None if fine.

    The order matters: a word that is simply correct exits first, then hyphen
    artefacts, then other languages, and only then is it called a misspelling.
    """
    word = token.strip("'-")
    if len(word) < 4 or word.lower() in custom:
        return None

    # An all-capitals token is an acronym or a heading in caps — TTUHSC, STAAR,
    # NCAA. A speller has no opinion worth reporting on those, and reporting
    # them buries the real errors.
    if word.isupper():
        return None

    # Clipped forms common in policy and legal text: Comm'n, Prof'l, Ass'n,
    # Gov't, ref'd. The apostrophe stands in for the letters left out, so a
    # speller reads them as broken words when they are written correctly.
    if _APOSTROPHE_ABBREVIATION_RE.fullmatch(word):
        return None

    # A hyphenated compound whose parts are all real words is valid English
    # ("high-quality", "state-certified"); only a broken word is a finding.
    if "-" in word:
        parts = [part for part in word.split("-") if part]
        if all(len(part) < 3 or _known_en(part) for part in parts):
            return None

    # Internal capitals in a known word are deliberate ("McPherson", "ConnectED"),
    # so only a word broken by a hyphen is reported as a casing problem.
    if _known_en(word):
        return None

    # A hyphen splitting a real word across a line break — "attach-ments",
    # "admin-istration". These come from copy pasted out of a typeset document,
    # so the hyphen is the source's line-breaking rather than a word the author
    # got wrong. Reporting them drowned the list, so they are left alone.
    if "-" in word and _known_en(word.replace("-", "")):
        return None

    # An inflection of a real word is not a misspelling.
    if _morphology_known(word):
        return None

    if _looks_like_name(word):
        return (SPELLING_POTENTIAL, None, None)

    # Only lower-case words are language-tested. "Paso", "Salle" and "Bandera"
    # are in Spanish and French dictionaries but on this kind of site they are
    # place names, and calling them foreign text is simply wrong.
    if not word[0].isupper():
        for code, label in _OTHER_LANGUAGES.items():
            speller = _spell_for(code)
            if speller is not None and speller.known([word.lower()]):
                return (SPELLING_LANGUAGE, None, label)

    # A capitalised word the speller cannot correct is a name, not a typo.
    if word[0].isupper() and not _spell().correction(word.lower()):
        return None

    correction = _spell().correction(word.lower())
    if correction and correction != word.lower():
        # A capitalised word is far more often a name than a typo, so a short one
        # is only ever reported as "potential", without a suggestion.
        if word[0].isupper() and len(word) < _MIN_TITLECASE_LIKELY:
            return (SPELLING_POTENTIAL, None, None)
        return (SPELLING_LIKELY, correction, "English (US)")
    # Unknown with no confident correction — most often a product or proper noun.
    return (SPELLING_POTENTIAL, None, None)


def spelling_candidates(text: str, custom_dictionary: set[str] | None = None) -> list[dict]:
    """Every distinct suspect word in ``text``, with its category and suggestion.

    Returns words, not occurrences: the caller locates each one in the DOM so the
    Inspector can highlight where it appears.
    """
    custom = {w.lower() for w in (custom_dictionary or set())}
    seen: set[str] = set()
    out: list[dict] = []
    body = text or ""
    for match in _SPELL_TOKEN_RE.finditer(body):
        raw = match.group()
        before = body[match.start() - 1] if match.start() else ""
        after = body[match.end()] if match.end() < len(body) else ""
        # Fragments of identifiers ("ttuk12") and of URLs shown as link text
        # ("https://www.depts.ttu.edu") are not words the author wrote.
        if before.isdigit() or after.isdigit() or before in "_./:@" or after in "_./:@":
            continue
        key = raw.lower()
        if key in seen:
            continue
        seen.add(key)
        verdict = classify_spelling(raw, custom)
        if verdict is None:
            continue
        category, suggestion, language = verdict
        out.append({
            "word": raw,
            "category": category,
            "suggestion": suggestion,
            "language": language,
        })
    return out


#: Per page, to keep a text-heavy page from flooding the scan.
_MAX_SPELLING_WORDS = 60
_MAX_OCCURRENCES_PER_WORD = 5


async def check_spelling_in_page(page, text: str, custom_dictionary: set[str] | None = None) -> list[dict]:
    """One record per on-page occurrence of a suspect word.

    Spell-checking runs over the extracted text, then each flagged word is located
    back in the live DOM so the Inspector can highlight exactly where it appears —
    the same approach the sensitive-keyword check uses.
    """
    from app.audit.policy_checks import locate_words_in_page

    candidates = spelling_candidates(text, custom_dictionary)[:_MAX_SPELLING_WORDS]
    if not candidates:
        return []

    words = [c["word"] for c in candidates]
    try:
        occurrences = await locate_words_in_page(page, words)
    except Exception:
        occurrences = []

    by_index: dict[int, list[dict]] = {}
    for item in occurrences:
        by_index.setdefault(int(item.get("patternIndex", -1)), []).append(item)

    out: list[dict] = []
    for index, candidate in enumerate(candidates):
        found = by_index.get(index, [])[:_MAX_OCCURRENCES_PER_WORD]
        # A word the DOM pass could not pin down is still a real finding; report it
        # once without a highlight rather than dropping it.
        for occurrence in found or [{}]:
            payload = {
                "word": candidate["word"],
                "category": candidate["category"],
                "suggestion": candidate["suggestion"],
                "language": candidate["language"],
                "context": occurrence.get("context", ""),
                "matched_text": occurrence.get("matchedText") or candidate["word"],
            }
            finding = _finding(
                "spelling", "content", "Writing", "minor",
                f'Possible misspelling: "{candidate["word"]}"',
                "Correct the spelling, or add the term to the site's custom dictionary if it is "
                "intentional (a brand or technical term).",
                selector=occurrence.get("selector"),
                html_snippet=json.dumps(payload),
            )
            finding["bbox"] = occurrence.get("bbox")
            finding["viewport"] = "desktop" if occurrence.get("bbox") else None
            out.append(finding)
    return out


def check_spelling(text: str, custom_dictionary: set[str] | None = None, max_flags: int = 40) -> list[dict]:
    """Flag likely misspellings. Skips capitalized tokens (proper nouns) and any
    word in the per-site custom dictionary to cut false positives."""
    custom = {w.lower() for w in (custom_dictionary or set())}
    candidates: list[str] = []
    seen: set[str] = set()
    for raw in _WORD_RE.findall(text):
        if raw[0].isupper():          # likely a name / start-of-sentence proper noun
            continue
        w = raw.lower().strip("'-")
        if w in seen or w in custom or len(w) < 4:
            continue
        seen.add(w)
        candidates.append(w)

    if not candidates:
        return []
    unknown = _spell().unknown(candidates)
    findings = []
    for w in list(unknown)[:max_flags]:
        findings.append(_finding(
            "spelling", "content", "Writing", "minor",
            f'Possible misspelling: "{w}"',
            "Correct the spelling, or add the term to the site's custom dictionary if it is "
            "intentional (a brand or technical term).",
            html_snippet=w, weight=1.0,
        ))
    return findings


def check_title_present(title: str) -> list[dict]:
    normalized = (title or "").strip()
    generic = normalized.lower() in {"home", "homepage", "untitled", "welcome", "page", "document"}
    if not normalized or len(normalized) < 10 or generic:
        return [_finding(
            "page-title", "content", "Page information", "moderate",
            "Page title is missing or may not describe the page appropriately",
            "Write a concise, unique <title> that clearly identifies this page's topic or purpose.",
            html_snippet=normalized,
        )]
    return []


def check_meta_description_present(meta: str | None) -> list[dict]:
    if not meta:
        return [_finding(
            "meta_description_too_short", "content", "Page information", "minor",
            "Page has no meta description",
            "Add a meta description of at least 60 characters that accurately summarizes the page.",
        )]
    return []


def run_content_checks(content: dict, custom_dictionary: set[str] | None = None) -> list[dict]:
    """All per-page content findings (everything except broken links + duplicates)."""
    findings: list[dict] = []
    findings += check_images_alt(content.get("images", []))
    findings += check_decorative_images(content.get("images", []))
    findings += check_heading_order(content.get("headings", []))
    findings += check_readability(content.get("text", ""))
    findings += check_reading_level(content.get("text", ""))
    findings += check_title_present(content.get("title", ""))
    findings += check_meta_description_present(content.get("metaDescription"))
    return findings


def finding_to_record(f: dict) -> dict:
    """Normalize a quality finding into the same record shape axe issues use, so
    persistence and scoring treat all issues uniformly."""
    return {
        "rule_id": f["check_id"],
        "category": f["category"],
        "subcategory": f.get("subcategory"),
        "weight": f.get("weight", 1.0),
        "impact": f.get("impact"),
        "description": f.get("description", ""),
        "remediation": f.get("remediation", ""),
        "reference_url": f.get("reference_url", ""),
        "bbox": f.get("bbox"),
        "viewport": f.get("viewport"),
        "wcag_version": (f.get("criterion") or (None, None, None, None))[0],
        "wcag_level": (f.get("criterion") or (None, None, None, None))[1],
        "criterion_id": (f.get("criterion") or (None, None, None, None))[2],
        "criterion_name": (f.get("criterion") or (None, None, None, None))[3],
        "is_best_practice": False,
        "manual_review": bool(f.get("manual_review", False)),
        "selector": f.get("selector"),
        "leaf_selector": None,
        "html_snippet": (f.get("html_snippet") or "")[:2000],
        "wcag_tags": [],
    }


# --- grammar (LanguageTool) -------------------------------------------------
# Kept separate from run_content_checks because the LanguageTool call is blocking
# and must be dispatched to an executor by the async page pipeline.

# LanguageTool severity -> the project's impact scale (drives scoring weight).
_GRAMMAR_IMPACT = {"error": "moderate", "warning": "minor"}


def grammar_sources(content: dict) -> dict[str, str]:
    """The four text sources Silktide grammar-checks, from extracted content."""
    return {
        "visible": content.get("mainText") or content.get("text", ""),
        "title": content.get("title", ""),
        "alt_text": content.get("altTexts", ""),
        "navigation": content.get("navText", ""),
    }


def _grammar_record(f: dict) -> dict:
    """Turn a GrammarChecker finding into a persistable Issue record. The rich
    display payload (excerpt, correction, source, etc.) rides in html_snippet as
    JSON so the grammar API/UI can render it without new columns."""
    payload = {
        "rule_id": f["rule_id"],
        "rule_message": f["rule_message"],
        "silktide_group": f["silktide_group"],
        "severity": f["severity"],
        "excerpt": f["excerpt"],
        "corrected_excerpt": f["corrected_excerpt"],
        "error_text": f["error_text"],
        "replacement": f["replacement"],
        "source_type": f["source_type"],
        "lang_code": f["lang_code"],
    }
    return {
        "rule_id": "grammar",
        "category": "content",
        "subcategory": "Grammar",
        "weight": 1.0,
        "impact": _GRAMMAR_IMPACT.get(f["severity"], "minor"),
        "description": f["silktide_group"],
        "remediation": f["rule_message"],
        "reference_url": "",
        "wcag_version": None, "wcag_level": None,
        "criterion_id": None, "criterion_name": None,
        "is_best_practice": False,
        "manual_review": False,
        "selector": None, "leaf_selector": None,
        "html_snippet": json.dumps(payload)[:2000],
        "wcag_tags": [],
    }


def run_grammar_records(
    content: dict, page_url: str,
    approved: set[str] | None = None, ignored_rules: set[str] | None = None,
) -> list[dict]:
    """Blocking. Run LanguageTool over the page's four sources and return
    Issue-shaped records, filtering site-wide approved text and ignored rules."""
    approved = approved or set()
    ignored_rules = ignored_rules or set()
    findings = GrammarChecker().check_page(grammar_sources(content), page_url)
    records = []
    for f in findings:
        if f["rule_id"] in ignored_rules or f["error_text"] in approved:
            continue
        records.append(_grammar_record(f))
    return records
