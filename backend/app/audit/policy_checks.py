"""Group B sub-batch 3 — policy keyword engine + inventory checks.

The policy engine is data-driven: keyword rules come from
``data/policy_keywords.json`` (defaults) or a site's own ``policy_rules`` (edited
via the admin ``/sites/{id}/policies`` endpoint). Every finding here is an
assisted (manual_review) item under the Policies / Privacy trees — none affect
the automated score.
"""

from __future__ import annotations

import json
import html as html_lib
import logging
import re
from functools import lru_cache
from pathlib import Path

from openai import AsyncOpenAI

from app.config import settings
from app.render.response_context import ResponseContext

logger = logging.getLogger("wcag_scanner.audit.policy")

_DATA = Path(__file__).resolve().parent / "data" / "policy_keywords.json"
_EXCERPT_PAD = 40
_MAX_TEXT = 200_000
_SENSITIVE_ANALYSIS_MAX_TEXT = 16_000
_SENSITIVE_ANALYSIS_MAX_TERMS = 30


@lru_cache(maxsize=1)
def load_default_policy_rules() -> list[dict]:
    """Built-in policy keyword rules. Cached; safe if the file is missing."""
    try:
        return json.loads(_DATA.read_text())
    except Exception:
        logger.warning("could not load %s; policy engine has no default rules", _DATA)
        return []


def _rec(
    rule_id, category, subcategory, description, remediation, *,
    html_snippet=None, selector=None, bbox=None, viewport=None,
):
    return {
        "rule_id": rule_id, "category": category, "subcategory": subcategory,
        "weight": 1.0, "impact": "minor",
        "description": description, "remediation": remediation, "reference_url": "",
        "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
        "is_best_practice": False, "manual_review": True,  # policies are assisted, never scored
        "selector": selector, "leaf_selector": None, "bbox": bbox, "viewport": viewport,
        "html_snippet": json.dumps(html_snippet) if html_snippet is not None else None,
        "wcag_tags": [],
    }


# B24: policy keyword rules -> one Issue per page+rule that matches.
def run_policy_checks(text: str, rules: list[dict]) -> list[dict]:
    text = (text or "")[:_MAX_TEXT]
    low = text.lower()
    out: list[dict] = []
    for rule in rules or []:
        rid = rule.get("id")
        # Sensitive keywords need one DOM-positioned issue per occurrence. They
        # are handled by ``check_sensitive_keywords`` below, not this page-level
        # policy summary path.
        if rid == "sensitive_keywords":
            continue
        patterns = rule.get("patterns") or []
        if not rid or not patterns:
            continue
        label = rule.get("label") or rid
        matched, count, excerpts = [], 0, []
        for pat in patterns:
            p = str(pat).lower().strip()
            if not p:
                continue
            idx = low.find(p)
            if idx == -1:
                continue
            matched.append(pat)
            count += low.count(p)
            s, e = max(0, idx - _EXCERPT_PAD), min(len(text), idx + len(p) + _EXCERPT_PAD)
            excerpts.append(("..." if s > 0 else "") + text[s:e].strip() + ("..." if e < len(text) else ""))
        if matched:
            category = "content" if rid == "sensitive_keywords" else "policies"
            subcategory = "Keywords" if rid == "sensitive_keywords" else "Policy review"
            out.append(_rec(
                rid, category, subcategory, label,
                "Page matches this policy keyword rule — review for compliance.",
                html_snippet={"rule_id": rid, "label": label, "matched_text": matched,
                              "match_count": count, "context_excerpts": excerpts[:5]},
            ))
    return out


def _terms_present_in_text(text: str, candidates: list[object]) -> list[str]:
    """Keep only model/config terms that occur as complete words or phrases."""
    found: list[str] = []
    seen: set[str] = set()
    for value in candidates[:_SENSITIVE_ANALYSIS_MAX_TERMS]:
        term = str(value).strip()
        normalized = term.casefold()
        if not term or len(term) > 80 or normalized in seen:
            continue
        matcher = re.compile(rf"(?<!\w){re.escape(term)}(?!\w)", flags=re.IGNORECASE)
        if matcher.search(text):
            found.append(term)
            seen.add(normalized)
    return found


async def discover_sensitive_keywords(text: str) -> list[str]:
    """Semantically identify review-worthy terms; never invent page matches.

    The model proposes candidates from the page itself. Every proposal is then
    validated against the captured text before it can become a finding. This
    avoids embedding a fixed keyword list in the scanner while keeping results
    tied to text that is actually present on the inspected page.
    """
    page_text = re.sub(r"\s+", " ", (text or "")).strip()[:_SENSITIVE_ANALYSIS_MAX_TEXT]
    if not page_text or not settings.openai_api_key:
        return []
    client = AsyncOpenAI(api_key=settings.openai_api_key, timeout=8.0)
    try:
        response = await client.chat.completions.create(
            model=settings.openai_model,
            temperature=0,
            max_tokens=400,
            response_format={"type": "json_object"},
            messages=[
                {
                    "role": "system",
                    "content": (
                        "Review webpage copy for exact words or short phrases that may reasonably "
                        "need human editorial review because they are potentially discriminatory, "
                        "exclusionary, stigmatizing, profane, sexually explicit, violent, threatening, "
                        "or otherwise reputationally sensitive. Be conservative: ordinary neutral "
                        "language is not sensitive. Return JSON only as {\"keywords\": [...]}. Each "
                        "item must be copied exactly from the supplied page text. Return an empty list "
                        "when nothing warrants review."
                    ),
                },
                {"role": "user", "content": page_text},
            ],
        )
        payload = json.loads(response.choices[0].message.content or "{}")
        candidates = payload.get("keywords", []) if isinstance(payload, dict) else []
        return _terms_present_in_text(page_text, candidates if isinstance(candidates, list) else [])
    except Exception:
        logger.exception("sensitive keyword semantic analysis failed")
        return []
    finally:
        await client.close()


async def resolve_sensitive_keyword_rules(text: str, rules: list[dict]) -> list[dict]:
    """Use site-configured patterns, or discover candidates for this page."""
    resolved = [dict(rule) for rule in (rules or [])]
    sensitive = next((rule for rule in resolved if rule.get("id") == "sensitive_keywords"), None)
    if sensitive and sensitive.get("patterns"):
        sensitive["patterns"] = _terms_present_in_text(text or "", list(sensitive["patterns"]))
        return resolved
    discovered = await discover_sensitive_keywords(text)
    if sensitive is None:
        sensitive = {"id": "sensitive_keywords", "label": "Sensitive keywords", "patterns": discovered}
        resolved.append(sensitive)
    else:
        sensitive["patterns"] = discovered
    return resolved


_SENSITIVE_KEYWORDS_JS = r"""
(patterns) => {
  const patternRegex = (pattern) => {
    const escaped = String(pattern || '').trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return escaped ? new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, 'giu') : null;
  };
  const selectorFor = (el) => {
    if (!el || el.nodeType !== Node.ELEMENT_NODE) return null;
    if (el.id) return `#${CSS.escape(el.id)}`;
    const parts = [];
    let current = el;
    while (current && current !== document.body && parts.length < 6) {
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

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  const occurrences = [];
  let node;
  let nodeOrder = 0;
  while ((node = walker.nextNode())) {
    const parent = node.parentElement;
    const raw = node.nodeValue || '';
    if (!parent || !raw.trim() || parent.closest('script,style,noscript,textarea,template,[hidden]')) {
      nodeOrder += 1;
      continue;
    }
    patterns.forEach((pattern, patternIndex) => {
      const matcher = patternRegex(pattern);
      if (!matcher) return;
      for (const match of raw.matchAll(matcher)) {
        const start = match.index;
        const matchedText = match[0];
        const range = document.createRange();
        range.setStart(node, start);
        range.setEnd(node, start + matchedText.length);
        const rect = range.getBoundingClientRect();
        const hasBox = rect.width > 0 && rect.height > 0;
        occurrences.push({
          patternIndex,
          visibleRank: hasBox ? 0 : 1,
          nodeOrder,
          start,
          matchedText,
          context: raw.slice(Math.max(0, start - 60), Math.min(raw.length, start + matchedText.length + 60)).trim(),
          selector: selectorFor(parent),
          bbox: hasBox ? {
              x: rect.left + window.scrollX,
              y: rect.top + window.scrollY,
              width: rect.width,
              height: rect.height,
          } : null,
        });
      }
    });
    nodeOrder += 1;
  }
  // Silktide also checks meaningful image/title attributes. Treat duplicate
  // alt+title text on the same element as one occurrence and highlight the
  // element itself because attribute text has no independent DOM Range.
  const attributeSeen = new Set();
  Array.from(document.querySelectorAll('[alt],[title]')).forEach((element, elementOrder) => {
    patterns.forEach((pattern, patternIndex) => {
      const matcher = patternRegex(pattern);
      const needle = String(pattern || '').trim().toLowerCase();
      if (!matcher) return;
      const values = [element.getAttribute('alt') || '', element.getAttribute('title') || ''];
      const source = values.find((value) => patternRegex(pattern)?.test(value));
      if (!source) return;
      const selector = selectorFor(element);
      const key = `${selector}|${needle}`;
      if (attributeSeen.has(key)) return;
      const rect = element.getBoundingClientRect();
      attributeSeen.add(key);
      const sourceMatch = source.match(matcher);
      if (!sourceMatch || sourceMatch.index == null) return;
      const hasBox = rect.width > 0 && rect.height > 0;
      occurrences.push({
        patternIndex,
        visibleRank: hasBox ? 0 : 1,
        nodeOrder: elementOrder,
        start: sourceMatch.index,
        matchedText: sourceMatch[0],
        context: source,
        selector,
        bbox: hasBox ? {
          x: rect.left + window.scrollX,
          y: rect.top + window.scrollY,
          width: rect.width,
          height: rect.height,
        } : null,
      });
    });
  });
  // Cap per word before capping overall. A flat cap sorted by patternIndex is
  // spent entirely on the first word when that word is common, so every later
  // word comes back with no position and cannot be highlighted.
  const PER_PATTERN = 8;
  const OVERALL = 400;
  const byPattern = new Map();
  occurrences
    .sort((a, b) => a.patternIndex - b.patternIndex || a.visibleRank - b.visibleRank || a.nodeOrder - b.nodeOrder || a.start - b.start)
    .forEach((item) => {
      const bucket = byPattern.get(item.patternIndex) || [];
      if (bucket.length < PER_PATTERN) {
        bucket.push(item);
        byPattern.set(item.patternIndex, bucket);
      }
    });
  return Array.from(byPattern.keys())
    .sort((a, b) => a - b)
    .flatMap((key) => byPattern.get(key))
    .slice(0, OVERALL);
}
"""


def _serialized_sensitive_candidates(html: str, patterns: list[str]) -> list[dict]:
    # Strip non-content elements first. Browser serialization can contain
    # malformed third-party scripts, so deliberately use a tolerant source
    # scan rather than requiring the entire document to parse as valid HTML.
    body = re.sub(
        r"<(script|style|noscript)\b[^>]*>.*?</\1\s*>", "", html or "",
        flags=re.IGNORECASE | re.DOTALL,
    )
    body_starts = list(re.finditer(r"<body\b[^>]*>", body, flags=re.IGNORECASE))
    if body_starts:
        # Comments in the source can mention a literal <body> tag. The final
        # opening tag is the actual document body in browser-serialized HTML.
        body = body[body_starts[-1].end():]
    body = re.split(r"</body\s*>", body, maxsplit=1, flags=re.IGNORECASE)[0]

    candidates: list[dict] = []
    # Silktide treats repeated alt/title copy on one element as one semantic
    # occurrence. It does not treat href values or meta tags as page copy.
    for tag_source in re.findall(r"<[^>]+>", body, flags=re.DOTALL):
        tag_match = re.match(r"<\s*([a-z][\w:-]*)", tag_source, flags=re.IGNORECASE)
        values: list[str] = []
        for _quote, value in re.findall(
            r"\b(?:alt|title)\s*=\s*([\"'])(.*?)\1", tag_source,
            flags=re.IGNORECASE | re.DOTALL,
        ):
            value = html_lib.unescape(value).strip()
            if value and value not in values:
                values.append(value)
        for pattern_index, pattern in enumerate(patterns):
            matcher = re.compile(rf"(?<!\w){re.escape(pattern)}(?!\w)", flags=re.IGNORECASE)
            source = next((value for value in values if matcher.search(value)), None)
            if source:
                match = matcher.search(source)
                if not match:
                    continue
                candidates.append({
                    "patternIndex": pattern_index,
                    "matchedText": match.group(0),
                    "context": source,
                    "selector": tag_match.group(1).lower() if tag_match else None,
                    "bbox": None,
                })

    visible_text = html_lib.unescape(re.sub(r"<[^>]+>", " ", body, flags=re.DOTALL))
    visible_text = re.sub(r"\s+", " ", visible_text).strip()
    for pattern_index, pattern in enumerate(patterns):
        matcher = re.compile(rf"(?<!\w){re.escape(pattern)}(?!\w)", flags=re.IGNORECASE)
        for match in matcher.finditer(visible_text):
            context_start = max(0, match.start() - 80)
            context_end = min(len(visible_text), match.end() + 80)
            candidates.append({
                "patternIndex": pattern_index,
                "matchedText": match.group(0),
                "context": visible_text[context_start:context_end].strip(),
                "selector": None,
                "bbox": None,
            })
    return candidates


async def locate_words_in_page(page, words: list[str]) -> list[dict]:
    """Find each word in the live DOM, returning selector, bbox and context.

    Shared with the spelling check so a flagged word can be highlighted on the
    page exactly where it appears.
    """
    if not words:
        return []
    return (await page.evaluate(_SENSITIVE_KEYWORDS_JS, words)) or []


async def check_sensitive_keywords(page, rules: list[dict], serialized_dom: str = "") -> list[dict]:
    rule = next((item for item in (rules or []) if item.get("id") == "sensitive_keywords"), None)
    patterns = [str(pattern).strip() for pattern in (rule or {}).get("patterns", []) if str(pattern).strip()]
    if not patterns:
        return []
    try:
        live_occurrences = await page.evaluate(_SENSITIVE_KEYWORDS_JS, patterns)
    except Exception:
        logger.exception("sensitive keyword DOM extraction failed")
        return []
    live_occurrences = live_occurrences or []
    static_candidates = _serialized_sensitive_candidates(serialized_dom, patterns) if serialized_dom else []
    occurrences: list[dict] = []
    for pattern_index, pattern in enumerate(patterns):
        live_for_pattern = [item for item in live_occurrences if item.get("patternIndex") == pattern_index]
        static_for_pattern = [item for item in static_candidates if item.get("patternIndex") == pattern_index]
        missing = max(0, len(static_for_pattern) - len(live_for_pattern))
        for item in [*live_for_pattern, *static_for_pattern[:missing]]:
            occurrences.append({**item, "canonicalPattern": pattern})
    total = len(occurrences)
    out = []
    for index, occurrence in enumerate(occurrences):
        # Use the configured spelling in the occurrence list (Silktide-style),
        # while context retains the page's original casing.
        word = occurrence.get("canonicalPattern") or occurrence.get("matchedText") or "keyword"
        out.append(_rec(
            "sensitive_keywords", "content", "Keywords",
            f'Sensitive keyword: "{word}"',
            "Review this word in context. Keep it when it is accurate and appropriate; otherwise replace it with clearer, neutral wording.",
            selector=occurrence.get("selector"), bbox=occurrence.get("bbox"),
            viewport="desktop" if occurrence.get("bbox") else None,
            html_snippet={
                "matched_text": word,
                "error_text": word,
                "context": occurrence.get("context") or "",
                "occurrence": index + 1,
                "match_count": total,
            },
        ))
    return out


# B25: forms & applications inventory (assisted)
def check_forms_inventory(forms: list[dict]) -> list[dict]:
    if not forms:
        return []
    return [_rec(
        "forms_inventory", "policies", "Forms",
        "Find forms and applications",
        "Inventory of the forms found on this page, for policy review.",
        html_snippet={"forms": [
            {"action": f.get("action", ""), "method": f.get("method", ""), "field_count": f.get("field_count", 0)}
            for f in forms
        ]},
    )]


# B26: headings inventory (assisted)
def check_headings_review(headings: list[dict]) -> list[dict]:
    return [
        _rec(
            "headings_review", "content", "Structure",
            f"Review h{heading.get('level')}: {(heading.get('text') or '(empty)')[:120]}",
            "Confirm this heading is accurate, useful, and correctly placed in the page outline.",
            selector=heading.get("selector"),
            html_snippet={
                "level": heading.get("level"),
                "text": (heading.get("text") or "")[:120],
                "html": (heading.get("html") or "")[:1000],
            },
        )
        for heading in headings[:100]
    ]


# B11: external network requests inventory (assisted, Privacy)
def check_network_requests_review(ctx: ResponseContext | None) -> list[dict]:
    if ctx is None:
        return []
    ext = ctx.external_requests
    if not ext:
        return []
    by_domain: dict[str, dict] = {}
    for r in ext:
        by_domain.setdefault(r.domain, {"domain": r.domain, "type": r.resource_type, "url": r.url})
    return [_rec(
        "network_requests_review", "privacy", "Audit",
        "Review all external network requests",
        "Review the external domains this page contacts and confirm each is expected.",
        html_snippet={"external_requests": list(by_domain.values())[:50], "count": len(ext)},
    )]


def run_policy_batch(text, headings, forms, ctx, policy_rules) -> list[dict]:
    """All sub-batch-3 checks for one page."""
    findings: list[dict] = []
    steps = [
        lambda: run_policy_checks(text, policy_rules),
        lambda: check_forms_inventory(forms or []),
        lambda: check_headings_review(headings or []),
        lambda: check_network_requests_review(ctx),
    ]
    for step in steps:
        try:
            findings += step()
        except Exception:
            logger.exception("a policy check failed")
    return findings
