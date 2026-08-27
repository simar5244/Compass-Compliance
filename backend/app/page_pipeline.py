"""The single per-page render+audit path, shared by the crawl worker and the
instant single-URL retest.

One page, three viewport passes on the SAME page object (responsive JS re-runs
on each resize, so each pass genuinely re-measures):

  1. desktop 1440 — axe-core, focus-visible (2.4.7), content/quality checks,
                     desktop bounding boxes, desktop screenshot
  2. mobile 375   — target-size (2.5.8), mobile screenshot
  3. narrow 320   — reflow (1.4.10); narrow screenshot only if reflow flags

Returns everything persistence needs; it performs no DB writes itself, so the
crawl and retest can persist with their own semantics (append vs. upsert).
"""

from __future__ import annotations

import asyncio
import json
import logging
from dataclasses import dataclass, field

from playwright.async_api import BrowserContext

from app.audit.axe_runner import run_axe
from app.audit.accessibility_scope import add_inspector_accessibility_aliases
from app.audit.content_checks import (
    check_spelling_in_page,
    extract_content,
    finding_to_record,
    run_content_checks,
    run_grammar_records,
)
from app.audit.dom_checks import (
    extract_dom_signals,
    extract_dom_signals_b2,
    run_dom_checks,
    run_dom_checks_b2,
)
from app.audit.header_checks import run_header_checks
from app.audit.lighthouse import run_lighthouse_checks
from app.audit.policy_checks import (
    check_sensitive_keywords,
    locate_words_in_page,
    resolve_sensitive_keyword_rules,
    run_policy_batch,
)
from app.audit.inventory import run_inventory
from app.audit.issues import build_issue_records
from app.audit.layout_checks import check_focus_visible, check_reflow, check_target_size
from app.audit.privacy_checks import run_privacy_checks
from app.audit.ttu_ada_checks import run_ttu_ada_checks
from app.audit.ttu_brand_checks import run_ttu_brand_checks
from app.audit.ttu_emergency_checks import run_ttu_emergency_checks
from app.audit.ttu_ferpa_checks import run_ttu_ferpa_checks
from app.audit.ttu_freshness_checks import run_ttu_freshness_checks
from app.config import settings
from app.crawl.normalize import is_in_scope
from app.diffing import content_hash_text
from app.render.capture import MOBILE_VIEWPORT, bounding_box_for, capture_with_metadata
from app.render.response_context import ResponseContext
from app.render.worker import RenderConfig, emulate_and_settle, render_page

logger = logging.getLogger("wcag_scanner.page_pipeline")

# Text of the main content, with navigation/boilerplate removed, for the
# content-change hash. Prefers <main>/[role=main]/<article>, else <body> minus
# header/nav/footer/aside.
_MAIN_TEXT_JS = r"""
() => {
  const pick = document.querySelector('main, [role="main"], article');
  const root = pick || document.body;
  if (!root) return '';
  const clone = root.cloneNode(true);
  clone.querySelectorAll('nav, header, footer, aside, script, style, noscript, svg title, svg desc, [hidden], [role="navigation"], [role="banner"], [role="contentinfo"]').forEach((el) => el.remove());

  // innerText needs layout, and a detached clone has none — it quietly degrades
  // to textContent, running the last word of one block into the first word of
  // the next ("Contact an Advisor" + "Our advisors" => "AdvisorOur"). Those
  // joins then read as repeated words and missing sentence spaces. Put the
  // block boundaries back explicitly instead.
  // SVG <title>/<desc> are accessible names, never rendered as page copy, but
  // textContent pulls them in and runs them together ("News for News" twice
  // => "News for NewsNews for News"), which reads as phrase repetition.
  clone.querySelectorAll('br').forEach((el) => el.replaceWith(document.createTextNode('\n')));
  clone.querySelectorAll(
    'p,div,li,tr,td,th,h1,h2,h3,h4,h5,h6,section,article,blockquote,figcaption,dt,dd,pre,ul,ol,table,form,label,option'
  ).forEach((el) => el.appendChild(document.createTextNode('\n\n')));

  return (clone.textContent || '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}
"""


def _word_count(text: str) -> int:
    return len([w for w in (text or "").split() if w.strip()])


def _sentences(text: str) -> list[str]:
    """The page's main text split into sentences.

    Uses the same segmentation as the reading-age calculation: a line that ends
    without punctuation — a heading, a table cell, a calendar entry — still
    counts as one sentence, so a page of short labels is not read as a single
    enormous one.
    """
    import re

    sentences: list[str] = []
    for line in (text or "").splitlines():
        line = line.strip()
        if not line:
            continue
        parts = [part.strip() for part in re.split(r"(?<=[.!?])\s+", line) if part.strip()]
        sentences.extend(parts or [line])
    return sentences


def _sentence_count(text: str) -> int:
    return len(_sentences(text))


#: Beyond this the grade level stops describing prose and just reflects a block of
#: text the formula could not segment, so it is reported as the ceiling.
_MAX_READING_GRADE = 20.0


def _reading_age(text: str) -> float | None:
    """Reading age in years for the page's main text.

    Flesch-Kincaid yields a US grade level; reading age is that plus five. The
    formula divides by sentence count, so a calendar or table whose lines carry no
    full stops reads as one enormous sentence and scores in the hundreds. Treating
    each line as a sentence keeps those pages comparable with prose.
    """
    try:
        import textstat
    except Exception:
        return None

    prose = " ".join(
        line.strip() if line.strip().endswith((".", "!", "?", ":", ";")) else f"{line.strip()}."
        for line in (text or "").splitlines()
        if line.strip()
    )
    if not prose:
        return None
    try:
        grade = float(textstat.flesch_kincaid_grade(prose))
    except Exception:
        return None
    return round(min(max(grade, 0.0), _MAX_READING_GRADE) + 5.0, 1)


@dataclass
class AuditedPage:
    url: str
    ok: bool
    error: str | None = None

    # render metadata
    status_code: int | None = None
    final_url: str | None = None
    stability_reason: str = ""
    cookie_rule: str | None = None
    render_ms: int = 0
    attempts: int = 0
    is_error_page: bool = False

    # findings (uniform records incl. manual_review, all categories/checks)
    records: list[dict] = field(default_factory=list)

    # every anchor occurrence on the page, in scope or not, for link checking
    link_occurrences: list[dict] = field(default_factory=list)

    # content signals for cross-page finalize
    title: str = ""
    meta_description: str | None = None
    external_links: list[str] = field(default_factory=list)
    external_link_occurrences: list[dict] = field(default_factory=list)
    links: list[str] = field(default_factory=list)  # all discovered links (for frontier)

    # change detection
    main_text: str = ""
    content_hash: str = ""
    render_unstable: bool = False

    # platform content metrics
    word_count: int = 0
    sentence_count: int = 0
    reading_age: float | None = None

    # artifacts
    desktop_png: bytes = b""
    mobile_png: bytes = b""
    narrow_png: bytes = b""
    serialized_dom: str = ""
    screenshots_meta: dict = field(default_factory=dict)

    # non-DOM signals captured at render time (headers/cookies/console/network/timing)
    response_context: ResponseContext | None = None


def _meta_entry(ref_key: str, m: dict) -> dict:
    return {
        "css_width": m.get("css_width", 0), "dpr": m.get("dpr", 1),
        "page_width_px": m.get("page_width_px", 0), "page_height_px": m.get("page_height_px", 0),
    }



#: Shorter than this and a phrase is too generic to pin to one place on the page.
_MIN_GRAMMAR_LOCATE_LEN = 3


async def _attach_grammar_positions(page, records: list[dict]) -> None:
    """Give grammar findings on-page coordinates.

    LanguageTool sees only extracted text, so its matches carry no DOM position
    and the Inspector can only report "no position recorded". Locate each flagged
    phrase back in the live DOM — the same pass spelling uses — and attach the
    box. Best effort throughout: a phrase split across elements, rewritten by
    script, or living in a title/alt attribute has no on-page box, and those
    findings are still real, so they are kept unhighlighted rather than dropped.
    """
    if not records:
        return

    # Rendered text can be located directly. Alt text cannot — it is an
    # attribute, not a text node — but the image carrying it is on the page, so
    # those findings are pointed at the image instead of left position-less.
    locatable: list[tuple[dict, str]] = []
    alt_records: list[tuple[dict, str]] = []
    for record in records:
        try:
            payload = json.loads(record.get("html_snippet") or "{}")
        except (ValueError, TypeError):
            continue
        source = payload.get("source_type")
        text = (payload.get("error_text") or "").strip()
        if len(text) < _MIN_GRAMMAR_LOCATE_LEN:
            continue
        if source in {"visible", "navigation"}:
            locatable.append((record, text))
        elif source == "alt_text":
            alt_records.append((record, text))

    if alt_records:
        await _attach_alt_text_positions(page, alt_records)
    if not locatable:
        return

    try:
        occurrences = await locate_words_in_page(page, [text for _record, text in locatable])
    except Exception:
        logger.debug("grammar position lookup failed", exc_info=True)
        return

    by_index: dict[int, list[dict]] = {}
    for item in occurrences or []:
        by_index.setdefault(int(item.get("patternIndex", -1)), []).append(item)

    # The same wording can be flagged more than once on a page. Hand each record
    # a different occurrence so repeated errors point at distinct spots instead
    # of all highlighting the first one.
    used: dict[str, int] = {}
    for index, (record, text) in enumerate(locatable):
        hits = by_index.get(index) or []
        if not hits:
            continue
        cursor = used.get(text, 0)
        hit = hits[cursor] if cursor < len(hits) else hits[0]
        used[text] = cursor + 1
        if not hit.get("bbox"):
            continue
        record["bbox"] = hit["bbox"]
        record["viewport"] = "desktop"
        if hit.get("selector"):
            record["selector"] = hit["selector"]



async def _attach_alt_text_positions(page, alt_records: list[tuple[dict, str]]) -> None:
    """Point a grammar finding in alt text at the image that carries it.

    The text itself is never rendered, so there is nothing to outline; the image
    is the thing a reader needs to look at to judge the wording.
    """
    try:
        images = await page.evaluate(
            """() => Array.from(document.querySelectorAll('img[alt]')).map((img) => {
                const r = img.getBoundingClientRect();
                return {
                  alt: img.getAttribute('alt') || '',
                  x: r.left + window.scrollX, y: r.top + window.scrollY,
                  width: r.width, height: r.height,
                };
            }).filter((i) => i.width > 0 && i.height > 0)"""
        ) or []
    except Exception:
        logger.debug("alt-text image lookup failed", exc_info=True)
        return

    for record, text in alt_records:
        needle = text.casefold()
        match = next((img for img in images if needle in (img.get("alt") or "").casefold()), None)
        if not match:
            continue
        record["bbox"] = {
            "x": match["x"], "y": match["y"],
            "width": match["width"], "height": match["height"],
        }
        record["viewport"] = "desktop"



#: Aggregate records that list values which can be found back in the page.
_EXPOSED_VALUE_KEYS = {
    "phone_numbers_exposed": "phone_numbers",
    "email_addresses_exposed": "email_addresses",
}


async def _attach_exposed_value_positions(page, records: list[dict]) -> None:
    """Add a per-value position map to the exposed phone/email records.

    These checks emit a single record per page covering every value, so the
    record itself has nowhere meaningful to point. Each value is located in the
    DOM and stored under ``positions`` keyed by the value, and the record's own
    bbox is set to the first hit so opening it still lands somewhere useful.
    """
    for record in records:
        payload_key = _EXPOSED_VALUE_KEYS.get(record.get("rule_id") or "")
        if not payload_key:
            continue
        payload = record.get("html_snippet")
        if isinstance(payload, str):
            try:
                payload = json.loads(payload)
            except (TypeError, ValueError):
                continue
        if not isinstance(payload, dict):
            continue
        values = [v for v in (payload.get(payload_key) or []) if isinstance(v, str) and v.strip()]
        if not values:
            continue

        try:
            occurrences = await locate_words_in_page(page, values[:100])
        except Exception:
            logger.debug("exposed-value position lookup failed", exc_info=True)
            continue

        positions: dict[str, dict] = {}
        for item in occurrences or []:
            index = int(item.get("patternIndex", -1))
            box = item.get("bbox")
            if not box or index < 0 or index >= len(values):
                continue
            positions.setdefault(values[index], box)

        if not positions:
            continue
        payload["positions"] = positions
        # Never slice the encoded JSON: a cut string is unparseable and would
        # take the whole value list down with it. If it is implausibly large,
        # drop the positions and keep the list intact.
        encoded = json.dumps(payload)
        if len(encoded) > 20000:
            payload.pop("positions", None)
            encoded = json.dumps(payload)
        record["html_snippet"] = encoded
        first = next((positions[v] for v in values if v in positions), None)
        if first and not record.get("bbox"):
            record["bbox"] = first
            record["viewport"] = "desktop"


async def audit_page(
    context: BrowserContext, url: str, render_cfg: RenderConfig,
    custom_dict: set[str], root_url: str,
    grammar_approved: set[str] | None = None, grammar_ignored: set[str] | None = None,
    policy_rules: list | None = None,
) -> AuditedPage:
    """Render ``url`` and run every check across the three viewports."""
    try:
        return await asyncio.wait_for(
            _audit_page(context, url, render_cfg, custom_dict, root_url,
                        grammar_approved or set(), grammar_ignored or set(), policy_rules or []),
            timeout=settings.page_time_ceiling_ms / 1000.0,
        )
    except asyncio.TimeoutError:
        # Loud on purpose: a page dropped here contributes zero findings, so a
        # silent timeout reads as a clean page rather than an unaudited one.
        logger.warning(
            "page audit exceeded the %sms time ceiling, no findings recorded for %s",
            settings.page_time_ceiling_ms, url,
        )
        return AuditedPage(url=url, ok=False, error="page audit exceeded time ceiling")


async def _audit_page(
    context: BrowserContext, url: str, render_cfg: RenderConfig,
    custom_dict: set[str], root_url: str,
    grammar_approved: set[str], grammar_ignored: set[str], policy_rules: list,
) -> AuditedPage:
    result = await render_page(context, url, render_cfg)
    if not result.ok:
        return AuditedPage(url=url, ok=False, error=result.error, attempts=result.attempts)

    page = result.page
    assert page is not None
    is_error_page = result.status_code is not None and result.status_code >= 400

    # --- pass 1: desktop (1440) ---
    axe_result = await run_axe(page)
    records = build_issue_records(axe_result)
    for rec in records:
        if rec.get("leaf_selector"):
            box = await bounding_box_for(page, rec["leaf_selector"])
            if box:
                rec["bbox"] = {"x": box.x, "y": box.y, "width": box.width, "height": box.height}
                rec["viewport"] = "desktop"

    records += await check_focus_visible(page)  # WCAG 2.4.7 (desktop)

    content = await extract_content(page)
    records += [finding_to_record(f) for f in run_content_checks(content, custom_dict)]
    # Spelling runs over the extracted text and then locates each flagged word in
    # the DOM, so it needs the live page rather than the text alone.
    records += [
        finding_to_record(f)
        for f in await check_spelling_in_page(page, content.get("text", ""), custom_dict)
    ]
    # LanguageTool is a blocking JVM call, so it runs off the event loop. It never
    # fails the page: a grammar engine that will not start yields no findings.
    try:
        grammar_records = await asyncio.get_running_loop().run_in_executor(
            None, run_grammar_records, content, url, grammar_approved, grammar_ignored,
        )
        # LanguageTool works on extracted text and has no idea where in the DOM a
        # match came from, so its findings arrive without coordinates and the
        # Inspector can only say "no position recorded". Locate each flagged
        # phrase back in the live DOM the same way spelling does, so grammar
        # issues can be highlighted too. Best effort: a phrase the DOM pass
        # cannot pin down (text split across elements, or rewritten by script)
        # is still a real finding and is kept without a highlight.
        await _attach_grammar_positions(page, grammar_records)
        records += grammar_records
    except Exception:
        logger.exception("grammar checks failed for %s", url)

    # Privacy / Policies (needs response headers) + Inventory (info-only)
    records += await run_privacy_checks(page, result.response_headers)
    records += await run_inventory(page)
    records += run_header_checks(result.response_context)  # Group A: header/response checks

    # Group B (sub-batch 1): DOM signals + render-context checks.
    dom_signals = await extract_dom_signals(page)
    dom_records = run_dom_checks(dom_signals, result.response_context, url)
    # Exposed phone numbers and email addresses are reported as one record per
    # page listing every value found, so there is no single place to point at.
    # Locate each value so the Inspector can highlight the one the reader picked
    # instead of just opening the page.
    await _attach_exposed_value_positions(page, dom_records)
    records += dom_records
    # Group B (sub-batch 2): pure DOM/URL checks (run after word_count below).
    dom_signals_b2 = await extract_dom_signals_b2(page)

    # Main-content text for change detection and platform content metrics.
    try:
        main_text = await page.evaluate(_MAIN_TEXT_JS)
    except Exception:
        main_text = ""
    content_hash = content_hash_text(main_text)
    word_count = _word_count(main_text)
    sentence_count = _sentence_count(main_text)
    reading_age = _reading_age(main_text)
    records += run_dom_checks_b2(dom_signals_b2, url, word_count)  # Group B sub-batch 2
    # Group B sub-batch 3: policy keyword engine + inventory (assisted).
    records += run_policy_batch(
        content.get("text", ""), content.get("headings", []),
        dom_signals.get("forms", []), result.response_context, policy_rules,
    )
    sensitive_rules = await resolve_sensitive_keyword_rules(content.get("text", ""), policy_rules)
    records += await check_sensitive_keywords(page, sensitive_rules, result.serialized_dom)
    # Group C: Lighthouse performance checks (no-op unless enable_lighthouse).
    records += await run_lighthouse_checks(url)

    # TTU Compliance and Brand Standards run after the existing audit chain.
    # Each runner is independently exception-safe so a new check cannot affect
    # the verified checks above it.
    logger.debug("Running TTU checks for %s: ADA", url)
    records += await run_ttu_ada_checks(page, result.serialized_dom, result.response_context)
    logger.debug("Running TTU checks for %s: FERPA", url)
    records += await run_ttu_ferpa_checks(page, result.serialized_dom)
    logger.debug("Running TTU checks for %s: Emergency", url)
    records += await run_ttu_emergency_checks(page, result.serialized_dom)
    logger.debug("Running TTU checks for %s: Brand Standards", url)
    records += await run_ttu_brand_checks(page, result.serialized_dom)
    logger.debug("Running TTU checks for %s: Freshness", url)
    records += await run_ttu_freshness_checks(page)

    # Attach desktop screenshot locations to every element-specific finding,
    # including our content checks. Axe findings are positioned earlier from
    # leaf_selector; custom rules expose a normal CSS selector instead.
    box_cache = {}
    for record in records:
        selector = record.get("selector")
        if record.get("bbox") or not isinstance(selector, str) or not selector:
            continue
        if selector not in box_cache:
            box_cache[selector] = await bounding_box_for(page, selector)
        box = box_cache[selector]
        if box:
            record["bbox"] = {"x": box.x, "y": box.y, "width": box.width, "height": box.height}
            record["viewport"] = "desktop"

    screenshots_meta = {"desktop": _meta_entry("desktop", result.desktop_screenshot_meta)}

    # --- pass 2: mobile (375) ---
    mobile_png = b""
    await emulate_and_settle(page, MOBILE_VIEWPORT["width"], quiet_ms=render_cfg.quiet_ms)
    records += await check_target_size(page)  # WCAG 2.5.8 (mobile)
    if settings.capture_mobile:
        shot = await capture_with_metadata(page)
        mobile_png = shot.png
        screenshots_meta["mobile"] = _meta_entry("mobile", shot.__dict__)

    # --- pass 3: narrow (320) — reflow ---
    narrow_png = b""
    await emulate_and_settle(page, settings.reflow_viewport_width, quiet_ms=settings.reflow_settle_quiet_ms)
    reflow_records = await check_reflow(page)  # WCAG 1.4.10 (320px)
    records += reflow_records
    if reflow_records:  # only keep a 320px screenshot when there's something to overlay
        shot = await capture_with_metadata(page)
        narrow_png = shot.png
        screenshots_meta["narrow"] = _meta_entry("narrow", shot.__dict__)

    records = add_inspector_accessibility_aliases(records)

    all_link_occurrences = [
        occ for occ in (result.anchor_links or [])
        if isinstance(occ, dict) and isinstance(occ.get("url"), str) and occ["url"].startswith(("http://", "https://"))
    ]
    # Internal links break too — a link to a moved page or a missing PDF is a
    # broken link even though the host is ours — so every anchor is checked.
    external_link_occurrences = [
        occ for occ in all_link_occurrences if not is_in_scope(occ["url"], root_url)
    ]
    external_links = sorted({occ["url"] for occ in external_link_occurrences if occ.get("url")})

    return AuditedPage(
        url=url, ok=True,
        status_code=result.status_code, final_url=result.final_url,
        stability_reason=result.stability_reason, cookie_rule=result.cookie_rule,
        render_ms=result.render_ms, attempts=result.attempts, is_error_page=is_error_page,
        records=records,
        title=content.get("title", ""), meta_description=content.get("metaDescription"),
        external_links=external_links,
        external_link_occurrences=external_link_occurrences,
        link_occurrences=all_link_occurrences,
        links=result.links,
        main_text=main_text, content_hash=content_hash, render_unstable=(result.stability_reason == "ceiling"),
        word_count=word_count, sentence_count=sentence_count, reading_age=reading_age,
        desktop_png=result.desktop_png, mobile_png=mobile_png, narrow_png=narrow_png,
        serialized_dom=result.serialized_dom, screenshots_meta=screenshots_meta,
        response_context=result.response_context,
    )
