"""LanguageTool-backed grammar engine.

Mirrors Silktide's grammar behaviour: detect the page language, run a real
grammar/spell parser over several text sources (visible body, title, alt text,
navigation), and emit reviewable findings tagged with a Silktide-style group and
severity plus an inline excerpt and a suggested correction.

Notes vs. the original spec (which was written against the old camelCase
``language_tool_python`` API):
  * The modern library (>=3.x) uses snake_case attributes: ``rule_id``,
    ``offset_in_context``, ``error_length``, ``matched_text``.
  * LanguageTool 6.x requires Java >= 17. The backend runs from a venv (no
    Docker), so we locate a modern JRE at runtime and put it on PATH; if none is
    found, grammar checking degrades to a no-op instead of breaking the scan.
"""

from __future__ import annotations

import logging
import re
import os
import shutil
import subprocess

logger = logging.getLogger("wcag_scanner.grammar")

# langdetect -> LanguageTool language code. Kept small and explicit; anything
# else falls back to en-US.
LANG_MAP = {
    "en": "en-US", "fr": "fr", "de": "de-DE", "es": "es", "nl": "nl",
    "pt": "pt-PT", "it": "it", "pl": "pl", "da": "da-DK",
}

# Only rules that say nothing about the writing are dropped. Casing, punctuation,
# typography and style all carry real findings a content reviewer acts on
# (missing space between sentences, comma after a month, "set up" vs "setup"),
# so filtering those categories wholesale would hide most of the report.
SKIP_RULES = {
    "UNPAIRED_BRACKETS", "EN_QUOTES", "MULTIPLICATION_SIGN", "ARROWS",
    "WORD_CONTAINS_UNDERSCORE", "DASH_RULE",
    # Whitespace complaints are about the shape of the text we extracted, not
    # about the page. Block elements are separated by blank lines so grammar is
    # not checked across boundaries, and LanguageTool then objects to that very
    # spacing — an author has nothing to fix and no way to fix it.
    "WHITESPACE_RULE", "CONSECUTIVE_SPACES",
}

#: LanguageTool carries its own spell checker. Spelling is a separate module with
#: its own dictionary, categories and per-word review, so those matches are left
#: to it rather than reported twice under Grammar.
SKIP_RULE_PREFIXES = ("MORFOLOGIK_RULE", "HUNSPELL_RULE", "SPELLER_RULE")
SKIP_CATEGORIES: set[str] = set()

#: LanguageTool rule ids to the label and severity shown in the report. Anything
#: unmapped falls back to LanguageTool's own message, so new rules still appear.
RULE_LABELS: dict[str, tuple[str, str]] = {
    "ENGLISH_WORD_REPEAT_RULE": ("Word repetition (e.g. 'will will')", "error"),
    "WORD_REPEAT_RULE": ("Word repetition (e.g. 'will will')", "error"),
    "PHRASE_REPETITION": ("Repetition of two words ('at the at the')", "error"),
    "ENGLISH_WORD_REPEAT_BEGINNING_RULE": ("Repeated sentence opening", "error"),
    "DOUBLE_PUNCTUATION": ("Repeated punctuation", "error"),
    "EN_A_VS_AN": ("Use of 'a' vs. 'an'", "warning"),
    "SENTENCE_WHITESPACE": ("Missing space between sentences", "warning"),
    "COMMA_PARENTHESIS_WHITESPACE": (
        "Use of whitespace before comma and before/after parentheses", "warning"),
    "WHITESPACE_RULE": ("Use of whitespace before comma and before/after parentheses", "warning"),
    "UPPERCASE_SENTENCE_START": ("Checks that a sentence starts with an uppercase letter", "warning"),
    "BASE_FORM": ("'admit', 'appreciate', 'avoid', 'enjoy' etc. with a base form of a verb", "warning"),
    "GERUND_INSTEAD_OF_INFINITIVE": (
        "'afford', 'choose', 'deserve', 'pretend', 'learn', 'strive', 'want' and "
        "'struggle' used with gerund instead of infinitive", "warning"),
    "PLURAL_VERB_AFTER_THIS": ("Possible agreement error: plural noun + singular verb", "warning"),
    "SINGULAR_NOUN_VERB_AGREEMENT": ("Possible agreement error: plural noun + singular verb", "warning"),
    "NUMEROUS_NOUN_AGREEMENT": ("Possible agreement error: numeral + singular countable noun", "warning"),
    "ALLOW_TO": ("Missing preposition: allow (to) do", "warning"),
    "I_AM": ("Missing 'I' in 'am I'", "warning"),
    "APART_A_PART": ("Apart of (a part of, apart from)", "warning"),
    "A_INFINITIVE": ("A infinitive", "warning"),
    "COMMA_AFTER_A_MONTH": ("Comma after a month", "warning"),
    "DATE_WEEKDAY": ("Weekday doesn't match date for the current year", "warning"),
    "PROBLEM_SOLVE": ("Problem-solve", "warning"),
    "RECOMMENDED_COMPOUNDS": ("Recommended compounds (smartphone, website, ...)", "warning"),
    "SETUP_VERB": ("Setup (set up)", "warning"),
    "SPECIFIC_POSSESSIVE_APOSTROPHE": ("Possessive apostrophe error", "warning"),
    "SUBJECT_MATTER": ("Subject matter (subject)", "warning"),
    "FALL_SEASON": ("Fall season (fall)", "warning"),
    "TO_DO_HYPHEN": ("Missing hyphen in 'to do'", "warning"),
    "WHETHER": ("The question whether (whether) etc.", "warning"),
}

_EXCERPT_MAX = 55
_MAX_WORDS_PER_SOURCE = 3000
_JAVA_READY: bool | None = None


def _java_major(java_bin: str) -> int | None:
    """Return the major version of ``java_bin`` (e.g. 17, 25), or None."""
    try:
        out = subprocess.check_output([java_bin, "-version"], stderr=subprocess.STDOUT, text=True)
    except Exception:
        return None
    # e.g. 'openjdk version "25.0.2"' or '"1.8.0_302"'
    import re
    m = re.search(r'version "(\d+)(?:\.(\d+))?', out)
    if not m:
        return None
    major = int(m.group(1))
    if major == 1 and m.group(2):  # legacy 1.8 style
        return int(m.group(2))
    return major


def ensure_java(min_major: int = 17) -> bool:
    """Make sure a Java >= ``min_major`` is on PATH for LanguageTool.

    Idempotent and cheap after the first call. Searches PATH first, then common
    Homebrew locations and ``/usr/libexec/java_home``. Prepends the chosen JDK to
    PATH and sets JAVA_HOME so the LanguageTool subprocess inherits it.
    """
    global _JAVA_READY
    if _JAVA_READY is not None:
        return _JAVA_READY

    current = shutil.which("java")
    if current and (_java_major(current) or 0) >= min_major:
        _JAVA_READY = True
        return True

    candidates: list[str] = []
    # Homebrew openjdk (unversioned = latest, plus explicit modern LTS/current).
    for name in ("openjdk", "openjdk@25", "openjdk@21", "openjdk@17"):
        candidates.append(f"/opt/homebrew/opt/{name}/bin/java")
        candidates.append(f"/usr/local/opt/{name}/bin/java")
    # macOS java_home for a modern version.
    try:
        home = subprocess.check_output(
            ["/usr/libexec/java_home", "-v", f"{min_major}+"], stderr=subprocess.DEVNULL, text=True
        ).strip()
        if home:
            candidates.insert(0, os.path.join(home, "bin", "java"))
    except Exception:
        pass

    for java_bin in candidates:
        if os.path.exists(java_bin) and (_java_major(java_bin) or 0) >= min_major:
            bin_dir = os.path.dirname(java_bin)
            os.environ["PATH"] = bin_dir + os.pathsep + os.environ.get("PATH", "")
            os.environ["JAVA_HOME"] = os.path.dirname(bin_dir)
            logger.info("grammar: using Java at %s", java_bin)
            _JAVA_READY = True
            return True

    logger.warning("grammar: no Java >= %d found; grammar checks disabled", min_major)
    _JAVA_READY = False
    return False



def _cap_words_keeping_paragraphs(text: str, limit: int) -> str:
    """Cap the text at ``limit`` words without flattening its paragraph breaks.

    Collapsing every run of whitespace (``" ".join(text.split())``) erases the
    blank lines the extractor puts between block elements, so LanguageTool sees
    one continuous paragraph and reports repetition across block boundaries that
    a reader never sees — a link reading "Credit" above a heading reading
    "Credit" becomes "Credit Credit". Horizontal whitespace is still collapsed;
    only the line structure survives.
    """
    end = len(text)
    for count, match in enumerate(re.finditer(r"\S+", text), start=1):
        if count >= limit:
            end = match.end()
            break
    capped = text[:end]
    capped = re.sub(r"[ \t]+", " ", capped)
    # Three or more newlines carry no more meaning than a single blank line.
    return re.sub(r"\n{3,}", "\n\n", capped).strip()


class GrammarChecker:
    """Thin wrapper over ``language_tool_python`` with a per-language singleton.

    Instances are cheap; the expensive LanguageTool server is cached on the class
    and shared across instances/threads.
    """

    _tools: dict = {}          # lang_code -> LanguageTool instance
    _unavailable: bool = False  # set if the engine can't be started at all

    @classmethod
    def get_tool(cls, lang_code: str = "en-US"):
        if cls._unavailable:
            return None
        if lang_code not in cls._tools:
            if not ensure_java():
                cls._unavailable = True
                return None
            try:
                import language_tool_python
                cls._tools[lang_code] = language_tool_python.LanguageTool(lang_code)
            except Exception as exc:  # pragma: no cover - environment dependent
                logger.warning("grammar: could not start LanguageTool(%s): %s", lang_code, exc)
                cls._unavailable = True
                return None
        return cls._tools[lang_code]

    def detect_language(self, text: str) -> str:
        """Detect the dominant language, mapped to a LanguageTool code."""
        sample = (text or "").strip()[:2000]
        if not sample:
            return "en-US"
        try:
            from langdetect import detect
            return LANG_MAP.get(detect(sample), "en-US")
        except Exception:
            return "en-US"

    def check_page(self, sources: dict[str, str], page_url: str) -> list[dict]:
        """Run grammar checks over every text source of a single page.

        ``sources`` maps a source_type ("visible"/"title"/"alt_text"/"navigation")
        to its text. Returns a flat list of finding dicts.
        """
        lang_code = self.detect_language(sources.get("visible", ""))
        tool = self.get_tool(lang_code)
        if tool is None:
            return []

        findings: list[dict] = []
        for source_type, text in sources.items():
            if not text or not text.strip():
                continue
            text = _cap_words_keeping_paragraphs(text, _MAX_WORDS_PER_SOURCE)
            try:
                matches = tool.check(text)
            except Exception:
                continue

            for match in matches:
                if not self._should_include(match):
                    continue
                group, severity = self._map_rule(match)
                start = match.offset_in_context
                end = start + match.error_length
                replacement = match.replacements[0] if match.replacements else None
                corrected = (
                    self._build_corrected_excerpt(match.context, start, end, replacement)
                    if replacement else None
                )
                findings.append({
                    "rule_id": match.rule_id,
                    "rule_message": match.message,
                    "category": match.category,
                    "silktide_group": group,
                    "severity": severity,
                    "excerpt": self._build_excerpt(match.context, start, end),
                    "corrected_excerpt": corrected,
                    "error_text": match.matched_text,
                    "replacement": replacement,
                    "source_type": source_type,
                    "lang_code": lang_code,
                    "page_url": page_url,
                })
        return findings

    # --- helpers -----------------------------------------------------------

    def _should_include(self, match) -> bool:
        rule_id = match.rule_id or ""
        if rule_id.startswith(SKIP_RULE_PREFIXES):
            return False
        return rule_id not in SKIP_RULES and match.category not in SKIP_CATEGORIES

    def _map_rule(self, match) -> tuple[str, str]:
        """Map a LanguageTool match to a (group name, severity)."""
        rule_id = match.rule_id or ""
        mapped = RULE_LABELS.get(rule_id)
        if mapped:
            return mapped

        # Unmapped rules keep their own wording so the report stays complete.
        if "WORD_REPEAT" in rule_id or "PHRASE_REPEAT" in rule_id:
            return "Word repetition (e.g. 'will will')", "error"
        if "AGREEMENT" in rule_id or "SUBJECT_VERB" in rule_id:
            return "Possible agreement error", "warning"
        message = (match.message or "").strip().rstrip(".")
        if message:
            return message[:120], "warning"
        return "Grammar issue", "warning"

    def _build_excerpt(self, context: str, err_start: int, err_end: int) -> str:
        """Single-line excerpt: '...pre ERROR post...' around the error."""
        pre = context[max(0, err_start - _EXCERPT_MAX):err_start]
        mid = context[err_start:err_end]
        post = context[err_end:err_end + _EXCERPT_MAX]
        prefix = "..." if err_start > _EXCERPT_MAX else ""
        suffix = "..." if err_end + _EXCERPT_MAX < len(context) else ""
        return f"{prefix}{pre}{mid}{post}{suffix}"

    def _build_corrected_excerpt(self, context: str, err_start: int, err_end: int, replacement: str) -> str:
        """Same window as ``_build_excerpt`` but with the error replaced."""
        pre = context[max(0, err_start - _EXCERPT_MAX):err_start]
        post = context[err_end:err_end + _EXCERPT_MAX]
        prefix = "..." if err_start > _EXCERPT_MAX else ""
        suffix = "..." if err_end + _EXCERPT_MAX < len(context) else ""
        return f"{prefix}{pre}{replacement}{post}{suffix}"
