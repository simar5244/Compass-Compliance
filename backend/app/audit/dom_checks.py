"""Group B DOM / rendered-page checks (sub-batch 1).

DOM signals are pulled from the rendered page in one ``page.evaluate`` round-trip
and combined with the render-time ``ResponseContext`` (cookies, console, errors).
Every check is a pure function over that plain data, so they unit-test without a
live browser. Runner never raises — a failing check logs and yields nothing.
"""

from __future__ import annotations

import json
import logging
import re
from urllib.parse import urlparse

from app.render.response_context import ResponseContext

logger = logging.getLogger("wcag_scanner.audit.dom")

_IMPACT = {"error": "serious", "warning": "moderate", "info": "minor"}

# Regexes are anchored to word-ish boundaries and run over VISIBLE text only
# (document.body.innerText already excludes <script> and display:none content).
# A run of digits alone is not a phone number — it could be an ID or a date — so
# a match needs the shape of one: brackets round the area code, or a separator
# after it, or an international prefix.
PHONE_RE = re.compile(r"(?:\+?1[-.\s]?)?(?:\(\d{3}\)\s?|\d{3}[-.\s])\d{3}[-.\s]?\d{4}")
EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
_MAX_TEXT = 120_000

_DOM_SIGNALS_JS = r"""
() => {
  const SENSITIVE = ['password','email','tel','number','date','file'];
  const forms = Array.from(document.querySelectorAll('form')).map((f) => {
    const fields = Array.from(f.querySelectorAll('input,select,textarea'));
    const names = fields.map((el) => el.getAttribute('name')).filter(Boolean).slice(0, 50);
    const sensitive = [...new Set(
      fields.map((el) => (el.getAttribute('type') || '').toLowerCase()).filter((t) => SENSITIVE.includes(t))
    )];
    // What a person actually sees against each field, so the form can be shown
    // back to a reviewer the way it appears on the page.
    const details = fields.slice(0, 30).map((el) => {
      const id = el.getAttribute('id');
      let label = '';
      if (id) {
        const tag = document.querySelector(`label[for="${CSS.escape(id)}"]`);
        if (tag) label = (tag.textContent || '').trim();
      }
      if (!label && el.closest('label')) label = (el.closest('label').textContent || '').trim();
      if (!label) label = el.getAttribute('aria-label') || '';
      if (!label) label = el.getAttribute('placeholder') || '';
      if (!label) label = el.getAttribute('name') || '';
      if (!label) label = el.getAttribute('id') || '';
      return {
        label: label.replace(/\s+/g, ' ').slice(0, 120),
        required: el.hasAttribute('required') || el.getAttribute('aria-required') === 'true',
        type: (el.getAttribute('type') || el.tagName || '').toLowerCase(),
      };
    });
    return {
      action: (f.getAttribute('action') || '').slice(0, 300),
      method: (f.getAttribute('method') || 'get').toLowerCase(),
      field_names: names, field_count: fields.length, sensitive_fields: sensitive,
      fields: details,
    };
  });

  // Contact details are often only in the link target: a phone number shown as
  // "Call us" still has the number in its tel: href.
  const contactLinks = { tel: [], mailto: [] };
  Array.from(document.querySelectorAll('a[href^="tel:"], a[href^="mailto:"]')).forEach((a) => {
    const href = (a.getAttribute('href') || '').trim();
    if (href.toLowerCase().startsWith('tel:')) {
      const value = decodeURIComponent(href.slice(4)).split('?')[0].trim();
      if (value) contactLinks.tel.push(value.slice(0, 40));
    } else if (href.toLowerCase().startsWith('mailto:')) {
      const value = decodeURIComponent(href.slice(7)).split('?')[0].trim();
      if (value) contactLinks.mailto.push(value.slice(0, 200));
    }
  });

  const brokenImages = [];
  Array.from(document.querySelectorAll('img')).forEach((img, i) => {
    // Loaded but zero-sized = broken src. offsetParent===null filters display:none.
    if (img.complete && img.naturalWidth === 0 && img.naturalHeight === 0 && img.offsetParent !== null) {
      brokenImages.push({ src: (img.getAttribute('src') || '').slice(0, 300), selector: `img:nth-of-type(${i + 1})` });
    }
  });

  const rx = /privacy.?polic|privacypolic|datenschutz|confidentialit/;
  const hasPrivacyLink = Array.from(document.querySelectorAll('a[href]')).some((a) => {
    const t = (a.textContent || '').toLowerCase();
    const h = (a.getAttribute('href') || '').toLowerCase();
    return rx.test(t) || rx.test(h);
  });

  return { forms, contactLinks, brokenImages, visibleText: document.body ? document.body.innerText : '', hasPrivacyLink };
}
"""


def _rec(rule_id, category, subcategory, severity, description, remediation,
         *, manual_review=False, selector=None, html_snippet=None):
    return {
        "rule_id": rule_id, "category": category, "subcategory": subcategory,
        "weight": 1.0, "impact": _IMPACT.get(severity, "minor"),
        "description": description, "remediation": remediation, "reference_url": "",
        "wcag_version": None, "wcag_level": None, "criterion_id": None, "criterion_name": None,
        "is_best_practice": False, "manual_review": manual_review,
        "selector": selector, "leaf_selector": None,
        "html_snippet": json.dumps(html_snippet) if html_snippet is not None else None,
        "wcag_tags": [],
    }


# --- B4: forms collect data (assisted) ----------------------------------

def check_form_data(signals: dict) -> list[dict]:
    forms = signals.get("forms") or []
    if not forms:
        return []
    return [_rec(
        "form_data_review", "privacy", "Audit", "error",
        "Forms on this page collect data — review what is stored",
        "Review each form's fields and confirm any personal data collected is disclosed and handled correctly.",
        manual_review=True,
        html_snippet={"forms": [
            {
                "action": f.get("action", ""),
                "method": f.get("method", ""),
                "sensitive_fields": f.get("sensitive_fields", []),
                "field_count": f.get("field_count", 0),
                "fields": f.get("fields", []),
            }
            for f in forms
        ]},
    )]


# --- B5 / B6: exposed phone numbers & emails (assisted) -----------------

def _scan_regex(signals: dict, rx: re.Pattern) -> list[str]:
    text = (signals.get("visibleText") or "")[:_MAX_TEXT]
    seen, out = set(), []
    for m in rx.finditer(text):
        v = m.group(0).strip()
        if v and v not in seen:
            seen.add(v)
            out.append(v)
    return out


def _contact_links(signals: dict, kind: str) -> list[str]:
    """Values taken from ``tel:`` / ``mailto:`` targets on the page.

    A link's target is author-written and is not always what it claims: a real
    site here ships ``<a href="mailto:Create a Case">``. Only values that look
    like the thing they claim to be are reported.
    """
    links = signals.get("contactLinks") or {}
    values = [value.strip() for value in (links.get(kind) or []) if value and value.strip()]
    if kind == "mailto":
        return [value for value in values if EMAIL_RE.fullmatch(value)]
    return [value for value in values if any(character.isdigit() for character in value)]


def _merge_unique(*groups: list[str]) -> list[str]:
    """All the values, first occurrence wins, order preserved."""
    seen: set[str] = set()
    out: list[str] = []
    for group in groups:
        for value in group:
            key = value.casefold()
            if key not in seen:
                seen.add(key)
                out.append(value)
    return out


def check_phone_numbers(signals: dict) -> list[dict]:
    # A number written as a link ("Call us") is exposed just as much as one
    # printed in the text, so both sources count.
    nums = _merge_unique(_scan_regex(signals, PHONE_RE), _contact_links(signals, "tel"))
    if not nums:
        return []
    return [_rec(
        "phone_numbers_exposed", "privacy", "Audit", "warning",
        f"{len(nums)} publicly visible phone number(s)",
        "Confirm publicly exposed phone numbers are intended to be public.",
        manual_review=True,
        html_snippet={"phone_numbers": nums[:200], "count": len(nums)},
    )]


def check_email_addresses(signals: dict) -> list[dict]:
    emails = _merge_unique(_scan_regex(signals, EMAIL_RE), _contact_links(signals, "mailto"))
    if not emails:
        return []
    return [_rec(
        "email_addresses_exposed", "privacy", "Audit", "warning",
        f"{len(emails)} publicly visible email address(es)",
        "Confirm exposed email addresses are intended to be public; consider obfuscation to reduce scraping.",
        manual_review=True,
        html_snippet={"email_addresses": emails[:200], "count": len(emails)},
    )]


# --- B8: broken images (scored) -----------------------------------------

def check_missing_images(signals: dict) -> list[dict]:
    out = []
    for img in signals.get("brokenImages") or []:
        out.append(_rec(
            "missing_images", "ux", "Functionality", "warning",
            "Image failed to load (broken source)",
            "Fix or remove the broken image so the page renders as intended.",
            selector=img.get("selector"),
            html_snippet={"src": img.get("src", ""), "selector": img.get("selector", "")},
        ))
    return out


# --- B3: cookies set but no privacy policy (scored) ---------------------

def check_cookies_review(ctx: ResponseContext | None, signals: dict) -> list[dict]:
    if ctx is None or not ctx.cookies or signals.get("hasPrivacyLink"):
        return []
    return [_rec(
        "cookies_review", "privacy", "Consent", "error",
        "Cookies are set but no privacy policy is linked",
        "Add a privacy policy link and disclose the cookies the site sets and why.",
        html_snippet={"cookie_count": len(ctx.cookies), "cookie_names": [c.name for c in ctx.cookies[:30]]},
    )]


def check_cookie_inventory(ctx: ResponseContext | None) -> list[dict]:
    if ctx is None or not ctx.cookies:
        return []
    payload = {
        "cookie_count": len(ctx.cookies),
        "cookies": [
            {"name": cookie.name, "domain": cookie.domain, "path": cookie.path, "secure": cookie.secure}
            for cookie in ctx.cookies[:100]
        ],
    }
    return [
        _rec(
            "privacy_cookies_review", "privacy", "Consent", "warning",
            f"Review {len(ctx.cookies)} cookie(s) detected on this page",
            "Document each cookie's purpose, provider, duration, and data use in the privacy or cookie policy.",
            manual_review=True, html_snippet=payload,
        ),
        _rec(
            "cookies_information", "privacy", "Information", "info",
            f"{len(ctx.cookies)} cookie(s) observed while rendering this page",
            "Informational cookie inventory; review the individual names and attributes.",
            manual_review=True, html_snippet=payload,
        ),
    ]


# --- B9: JavaScript errors (scored) -------------------------------------

def check_javascript_errors(ctx: ResponseContext | None) -> list[dict]:
    if ctx is None:
        return []
    errs = [{"message": e[:300], "source": "pageerror", "line": 0} for e in ctx.page_errors]
    errs += [{"message": m.text[:300], "source": m.url, "line": m.line} for m in ctx.console_errors]
    if not errs:
        return []
    return [_rec(
        "javascript_errors", "ux", "Functionality", "warning",
        f"{len(errs)} JavaScript error(s) on this page",
        "Fix the JavaScript errors; uncaught errors can break interactive functionality for users.",
        html_snippet={"errors": errs[:50], "count": len(errs)},
    )]


# --- B10: console log/warning messages (assisted) -----------------------

def check_javascript_logs(ctx: ResponseContext | None) -> list[dict]:
    if ctx is None:
        return []
    msgs = [m for m in ctx.console_messages if m.level in ("warning", "log", "info", "debug")]
    if not msgs:
        return []
    return [_rec(
        "javascript_logs", "ux", "Functionality", "info",
        f"{len(msgs)} console log/warning message(s)",
        "Review console output; leftover debug logging can leak information or hint at problems.",
        manual_review=True,
        html_snippet={"messages": [{"level": m.level, "message": m.text[:200]} for m in msgs[:50]], "count": len(msgs)},
    )]


async def extract_dom_signals(page) -> dict:
    try:
        return await page.evaluate(_DOM_SIGNALS_JS)
    except Exception:
        return {"forms": [], "brokenImages": [], "visibleText": "", "hasPrivacyLink": False}


def run_dom_checks(signals: dict, ctx: ResponseContext | None, page_url: str) -> list[dict]:
    """Run every sub-batch-1 DOM/context check for one page."""
    logger.debug(
        "dom signals: forms=%d broken_imgs=%d text=%dchars privacy_link=%s | ctx=%s",
        len(signals.get("forms", [])), len(signals.get("brokenImages", [])),
        len(signals.get("visibleText", "")), signals.get("hasPrivacyLink"), ctx is not None,
    )
    findings: list[dict] = []
    steps = [
        lambda: check_form_data(signals),
        lambda: check_phone_numbers(signals),
        lambda: check_email_addresses(signals),
        lambda: check_missing_images(signals),
        lambda: check_cookies_review(ctx, signals),
        lambda: check_cookie_inventory(ctx),
        lambda: check_javascript_errors(ctx),
        lambda: check_javascript_logs(ctx),
    ]
    for step in steps:
        try:
            findings += step()
        except Exception:
            logger.exception("a dom check failed")
    return findings


# =======================================================================
# Group B sub-batch 2 — pure DOM / URL checks (no ResponseContext needed)
# =======================================================================

_URL_EXTENSIONS = (".html", ".htm", ".php", ".asp", ".aspx", ".cfm", ".jsp")
_TITLE_MAX = 60
_META_MIN = 60
_THIN_WORDS = 300
_VAGUE_HEADING_LABELS = {
    "click here", "learn more", "more", "read more", "details", "information",
    "info", "go", "continue", "next", "previous", "here", "section", "content",
}

_DOM_SIGNALS_B2_JS = r"""
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
  const title = document.title || '';
  const LABELABLE = new Set(['INPUT','SELECT','TEXTAREA','BUTTON','METER','OUTPUT','PROGRESS']);
  const fieldsetsNoLegend = [];
  Array.from(document.querySelectorAll('fieldset')).forEach((fs) => {
    const legend = fs.querySelector(':scope > legend');
    if (!legend || !(legend.innerText || '').trim()) {
      fieldsetsNoLegend.push({ selector: selectorFor(fs), html: fs.outerHTML.slice(0, 400) });
    }
  });

  const orphanLabels = [];
  const misusedLabels = [];
  Array.from(document.querySelectorAll('label[for]')).forEach((el) => {
    const target = el.getAttribute('for');
    let ref = null;
    try { ref = document.getElementById(target); } catch (e) { ref = null; }
    if (!ref) {
      orphanLabels.push({ selector: selectorFor(el), for: target, text: (el.innerText || '').trim().slice(0, 80) });
    } else if (!LABELABLE.has(ref.tagName) && ref.getAttribute('role') !== 'textbox') {
      misusedLabels.push({ selector: selectorFor(el), for: target, target_tag: ref.tagName.toLowerCase(),
                           text: (el.innerText || '').trim().slice(0, 80) });
    }
  });
  // A <label> wrapping something that cannot take a label is the same mistake.
  Array.from(document.querySelectorAll('label:not([for])')).forEach((el) => {
    const inner = el.querySelector('input,select,textarea,button,meter,output,progress');
    if (!inner && (el.innerText || '').trim()) {
      misusedLabels.push({ selector: selectorFor(el), for: null, target_tag: null,
                           text: (el.innerText || '').trim().slice(0, 80) });
    }
  });

  // 1.4.11: a control the eye cannot separate from the page has no visible boundary.
  const lowContrastControls = [];
  Array.from(document.querySelectorAll('input,select,textarea')).slice(0, 200).forEach((el) => {
    const type = (el.getAttribute('type') || '').toLowerCase();
    if (['hidden','submit','button','image','reset','checkbox','radio','range','color','file'].includes(type)) return;
    const cs = getComputedStyle(el);
    const noBorder = cs.borderStyle === 'none' || parseFloat(cs.borderTopWidth || '0') === 0;
    const parentBg = getComputedStyle(el.parentElement || document.body).backgroundColor;
    const sameBg = cs.backgroundColor === parentBg
      || cs.backgroundColor === 'rgba(0, 0, 0, 0)' || cs.backgroundColor === 'transparent';
    const noOutline = cs.outlineStyle === 'none' || parseFloat(cs.outlineWidth || '0') === 0;
    if (noBorder && sameBg && noOutline) {
      lowContrastControls.push({ selector: selectorFor(el), tag: el.tagName.toLowerCase(), type,
                                 html: el.outerHTML.slice(0, 300) });
    }
  });

  // 3.3.2 / 3.3.5: forms that constrain input without explaining it, and forms
  // with no route to help. Both need a human eye, so we only gather evidence.
  const fieldsWithoutInstructions = [];
  const formsWithoutHelp = [];
  Array.from(document.querySelectorAll('form')).slice(0, 30).forEach((form) => {
    const helpText = (form.innerText || '').toLowerCase();
    const hasHelpLink = !!form.querySelector('a[href*="help"],a[href*="contact"],a[href*="support"],a[href*="faq"]');
    if (!hasHelpLink && !/\b(help|contact us|questions|support)\b/.test(helpText)) {
      formsWithoutHelp.push({ selector: selectorFor(form), fields: form.querySelectorAll('input,select,textarea').length });
    }
    Array.from(form.querySelectorAll('input,select,textarea')).slice(0, 40).forEach((el) => {
      const type = (el.getAttribute('type') || '').toLowerCase();
      if (['hidden', 'submit', 'button', 'image', 'reset'].includes(type)) return;
      const constrained = el.hasAttribute('required') || el.hasAttribute('pattern')
        || el.hasAttribute('minlength') || el.hasAttribute('maxlength') || type === 'email' || type === 'tel';
      const described = el.getAttribute('aria-describedby') || el.getAttribute('title') || el.getAttribute('placeholder');
      if (constrained && !described) {
        fieldsWithoutInstructions.push({
          selector: selectorFor(el), name: el.getAttribute('name') || el.id || '', type: type || el.tagName.toLowerCase(),
        });
      }
    });
  });

  const h1s = Array.from(document.querySelectorAll('h1'));
  const metaEl = document.querySelector('meta[name="description"]');

  const placeholderLinks = [];
  const emptyLinks = [];
  const brokenAnchors = [];
  const undisclosedNewTabLinks = [];
  const vagueLinks = [];
  const VAGUE_LINK_TEXT = new Set([
    'click here', 'click', 'here', 'read more', 'more', 'learn more', 'find out more',
    'more info', 'more information', 'details', 'view', 'view more', 'see more',
    'continue', 'go', 'link', 'this page', 'download', 'this link',
  ]);
  Array.from(document.querySelectorAll('a')).forEach((a) => {
    const sel = selectorFor(a);
    const href = a.getAttribute('href');
    const ph = href === '#' || href === 'javascript:void(0)' || href === 'javascript:void(0);' || href === 'javascript:;';
    const clickableNoHref = href === null && (a.getAttribute('role') === 'button' || typeof a.onclick === 'function');
    if (ph || clickableNoHref) {
      placeholderLinks.push({ text: (a.textContent || '').trim().slice(0, 80), href: href || '', selector: sel, html: a.outerHTML.slice(0, 1000) });
    }
    if (href) {
      const text = (a.innerText || '').trim();
      const accessibleText = `${text} ${a.getAttribute('aria-label') || ''} ${a.getAttribute('title') || ''}`.toLowerCase();
      if (a.getAttribute('target') === '_blank' && !/(new tab|new window|opens? in)/.test(accessibleText)) {
        undisclosedNewTabLinks.push({ text: text.slice(0, 100), href: href.slice(0, 300), selector: sel, html: a.outerHTML.slice(0, 1000) });
      }
      const img = a.querySelector('img[alt]');
      const imgAlt = img && (img.getAttribute('alt') || '').trim();
      if (!text && !a.getAttribute('aria-label') && !a.getAttribute('title') && !imgAlt) {
        emptyLinks.push({ selector: sel, href: href.slice(0, 200) });
      }
      // A link whose whole accessible name is a filler phrase does not say where it
      // goes. An aria-label or title that adds real wording rescues it.
      const name = (a.getAttribute('aria-label') || text || '').trim().toLowerCase()
        .replace(/[\s\u00a0]+/g, ' ').replace(/[.\u2026>\u2192\-\u2013\u2014:]+$/, '').trim();
      if (name && VAGUE_LINK_TEXT.has(name)) {
        vagueLinks.push({ text: text.slice(0, 100), href: href.slice(0, 300), selector: sel, html: a.outerHTML.slice(0, 1000) });
      }
      if (href.startsWith('#') && href.length > 1) {
        const id = href.slice(1);
        let ok = false;
        try { ok = !!document.getElementById(id) || !!document.querySelector(`[name="${CSS.escape(id)}"]`); } catch (e) { ok = true; }
        if (!ok) brokenAnchors.push({ href, missing_id: id, selector: sel });
      }
    }
  });

  const tables = Array.from(document.querySelectorAll('table'));
  const favicons = Array.from(document.querySelectorAll('link[rel~="icon"],link[rel~="shortcut"]')).map((l) => ({
    rel: l.getAttribute('rel') || '', href: (l.getAttribute('href') || '').slice(0, 300), type: l.getAttribute('type') || '',
  }));
  const mainEl = document.querySelector('main,[role="main"],article') || document.body;
  const headingsAndLabels = Array.from(document.querySelectorAll('h1,h2,h3,h4,h5,h6,label,legend'))
    .map((el) => ({
      element: el.tagName.toLowerCase(), text: (el.textContent || '').trim().slice(0, 160),
      selector: selectorFor(el), html: el.outerHTML.slice(0, 1000),
    }));

  const sensoryLanguage = [];
  const sensoryRx = /\b(?:shown|marked|highlighted|displayed|indicated)\s+in\s+(?:red|green|blue|yellow|orange|purple|gray|grey)|\b(?:red|green|blue|yellow|orange|purple|gray|grey)\s+(?:text|button|box|area|section|items?)|\b(?:above|below|to the left|to the right)\s+(?:button|box|image|icon|link|section)|\b(?:round|circular|square|triangle|star)\s+(?:button|icon|symbol)/i;
  const walker = document.createTreeWalker(document.body || document.documentElement, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode()) && sensoryLanguage.length < 50) {
    const parent = node.parentElement;
    const value = (node.nodeValue || '').trim();
    if (!parent || !value || parent.closest('script,style,noscript,template,[hidden]')) continue;
    const match = value.match(sensoryRx);
    if (match) sensoryLanguage.push({ text: match[0], context: value.slice(0, 300), selector: selectorFor(parent), html: parent.outerHTML.slice(0, 1000) });
  }
  const visualOnlyElements = Array.from(document.querySelectorAll('canvas,svg:not([aria-label]):not([aria-labelledby]):not([role="presentation"])'))
    .filter((el) => {
      if (el.getAttribute('aria-hidden') === 'true') return false;
      if (el.matches('svg') && (el.querySelector('title,desc') || (el.textContent || '').trim())) return false;
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0;
    })
    .slice(0, 50)
    .map((el) => ({ element: el.tagName.toLowerCase(), selector: selectorFor(el), html: el.outerHTML.slice(0, 1000) }));

  const visible = (el) => {
    const rect = el.getBoundingClientRect();
    const style = getComputedStyle(el);
    return rect.width > 0 && rect.height > 0 && style.display !== 'none' && style.visibility !== 'hidden';
  };
  const nativeInteractive = 'a[href],button,input,select,textarea,summary,details';
  const keyboardInaccessible = Array.from(document.querySelectorAll('*'))
    .filter((el) => visible(el) && (el.hasAttribute('onclick') || typeof el.onclick === 'function'))
    .filter((el) => !el.matches(nativeInteractive) && !el.hasAttribute('tabindex') && !el.hasAttribute('role'))
    .slice(0, 100)
    .map((el) => ({ selector: selectorFor(el), element: el.tagName.toLowerCase(), html: el.outerHTML.slice(0, 1000) }));

  const helpRx = /\b(help|support|contact|faq|frequently asked|assistance|chat)\b/i;
  const helpMechanisms = Array.from(document.querySelectorAll('a[href],button'))
    .filter((el) => {
      const text = `${el.innerText || ''} ${el.getAttribute('aria-label') || ''} ${el.getAttribute('title') || ''}`;
      const href = el.getAttribute('href') || '';
      return visible(el) && (helpRx.test(text) || helpRx.test(href) || /^(mailto|tel):/i.test(href));
    })
    .slice(0, 50)
    .map((el) => ({
      selector: selectorFor(el), text: (el.innerText || el.getAttribute('aria-label') || '').trim().slice(0, 160),
      href: (el.getAttribute('href') || '').slice(0, 300), element: el.tagName.toLowerCase(), html: el.outerHTML.slice(0, 1000),
    }));

  const tabOrderRisks = [];
  Array.from(document.querySelectorAll('[tabindex]')).forEach((el) => {
    const value = Number(el.getAttribute('tabindex'));
    if (visible(el) && Number.isFinite(value) && value > 0) {
      tabOrderRisks.push({ selector: selectorFor(el), reason: `positive tabindex (${value}) changes focus order`, html: el.outerHTML.slice(0, 1000) });
    }
  });
  const sequenceRisks = [];
  Array.from(document.querySelectorAll('*')).forEach((el) => {
    if (sequenceRisks.length >= 100 || !visible(el)) return;
    const order = Number.parseInt(getComputedStyle(el).order, 10);
    if (Number.isFinite(order) && order !== 0) {
      sequenceRisks.push({ selector: selectorFor(el), reason: `CSS order ${order} may differ from DOM order`, html: el.outerHTML.slice(0, 1000) });
    }
  });

  const dragElements = Array.from(document.querySelectorAll('[draggable="true"],[ondragstart],[ondrop]'))
    .filter(visible).slice(0, 50)
    .map((el) => ({ selector: selectorFor(el), element: el.tagName.toLowerCase(), html: el.outerHTML.slice(0, 1000) }));

  const duplicateFormFields = [];
  Array.from(document.forms).forEach((form) => {
    const seen = new Map();
    Array.from(form.querySelectorAll('input:not([type=hidden]):not([type=radio]):not([type=checkbox]),select,textarea')).forEach((el) => {
      if (!visible(el)) return;
      const key = (el.getAttribute('autocomplete') || el.getAttribute('name') || '').trim().toLowerCase();
      if (!key) return;
      if (seen.has(key)) duplicateFormFields.push({ selector: selectorFor(el), field: key, first_selector: seen.get(key), html: el.outerHTML.slice(0, 1000) });
      else seen.set(key, selectorFor(el));
    });
  });

  const movingContent = Array.from(document.querySelectorAll('marquee,blink,video[autoplay],audio[autoplay],[style*="animation" i]'))
    .filter(visible).slice(0, 50)
    .map((el) => ({ selector: selectorFor(el), element: el.tagName.toLowerCase(), html: el.outerHTML.slice(0, 1000) }));
  const interruptionElements = Array.from(document.querySelectorAll('[role="alertdialog"],[role="alert"],dialog[open],[aria-live="assertive"]'))
    .filter(visible).slice(0, 50)
    .map((el) => ({ selector: selectorFor(el), role: el.getAttribute('role') || el.tagName.toLowerCase(), text: (el.innerText || '').trim().slice(0, 250), html: el.outerHTML.slice(0, 1000) }));

  const bodyText = document.body ? document.body.innerText : '';
  const hasTimeLimitLanguage = /\b(?:time(?:d|out| limit)|session (?:expires?|timeout)|inactiv(?:e|ity)|countdown|seconds? remaining)\b/i.test(bodyText);
  const timeLimitElement = hasTimeLimitLanguage
    ? Array.from(document.querySelectorAll('body *')).find((el) => visible(el) && /\b(?:time(?:d|out| limit)|session (?:expires?|timeout)|inactiv(?:e|ity)|countdown|seconds? remaining)\b/i.test(el.innerText || ''))
    : null;

  const abbreviationsWithoutMeaning = Array.from(document.querySelectorAll('abbr:not([title]),acronym:not([title])'))
    .filter(visible).slice(0, 100)
    .map((el) => ({ selector: selectorFor(el), text: (el.textContent || '').trim().slice(0, 80), html: el.outerHTML.slice(0, 1000) }));
  const unusualWordCandidates = Array.from(document.querySelectorAll('[data-term],.glossary-term,.jargon'))
    .filter((el) => visible(el) && !el.getAttribute('title') && !el.getAttribute('aria-describedby'))
    .slice(0, 50).map((el) => ({ selector: selectorFor(el), text: (el.textContent || '').trim().slice(0, 120), html: el.outerHTML.slice(0, 1000) }));

  const imageTextCandidates = Array.from(document.images)
    .filter((img) => visible(img) && (img.getAttribute('alt') || '').trim().split(/\s+/).length >= 3)
    .slice(0, 100).map((img) => ({ selector: selectorFor(img), alt: (img.getAttribute('alt') || '').slice(0, 300), src: (img.currentSrc || img.src || '').slice(0, 300), html: img.outerHTML.slice(0, 1000) }));
  const visualPresentationRisks = Array.from(document.querySelectorAll('[style]'))
    .filter((el) => visible(el) && /(?:font-size|line-height|letter-spacing|word-spacing)\s*:[^;]+!important/i.test(el.getAttribute('style') || ''))
    .slice(0, 50).map((el) => ({ selector: selectorFor(el), style: (el.getAttribute('style') || '').slice(0, 500), html: el.outerHTML.slice(0, 1000) }));
  const flashCandidates = Array.from(document.querySelectorAll('video,canvas,img[src$=".gif" i],object,embed'))
    .filter(visible).slice(0, 50)
    .map((el) => ({ selector: selectorFor(el), element: el.tagName.toLowerCase(), src: (el.getAttribute('src') || el.getAttribute('data') || '').slice(0, 300), html: el.outerHTML.slice(0, 1000) }));

  const largeControlCandidates = Array.from(document.querySelectorAll(nativeInteractive + ',[role="button"],[role="link"],[tabindex]'))
    .filter(visible).map((el) => ({ el, rect: el.getBoundingClientRect() }))
    .filter(({rect}) => rect.width < 44 || rect.height < 44).slice(0, 100)
    .map(({el, rect}) => ({ selector: selectorFor(el), width: Math.round(rect.width), height: Math.round(rect.height), html: el.outerHTML.slice(0, 1000) }));

  const navigationRegions = Array.from(document.querySelectorAll('nav,[role="navigation"]'))
    .filter(visible).slice(0, 20)
    .map((el) => ({ selector: selectorFor(el), label: el.getAttribute('aria-label') || el.getAttribute('aria-labelledby') || '', links: Array.from(el.querySelectorAll('a[href]')).slice(0, 30).map((a) => (a.innerText || a.getAttribute('aria-label') || '').trim()) }));
  const inconsistentComponents = [];
  const linksByHref = new Map();
  Array.from(document.querySelectorAll('a[href]')).filter(visible).forEach((a) => {
    const href = a.href;
    const name = (a.innerText || a.getAttribute('aria-label') || '').trim();
    if (!href || !name) return;
    const previous = linksByHref.get(href);
    if (previous && previous.name !== name) inconsistentComponents.push({ selector: selectorFor(a), href, name, other_name: previous.name, html: a.outerHTML.slice(0, 1000) });
    else linksByHref.set(href, {name, selector: selectorFor(a)});
  });
  const wayCount = [
    !!document.querySelector('input[type="search"],form[role="search"],[role="search"]'),
    Array.from(document.querySelectorAll('a[href]')).some((a) => /sitemap|site map/i.test(`${a.innerText || ''} ${a.getAttribute('href') || ''}`)),
    navigationRegions.length > 0,
  ].filter(Boolean).length;

  return {
    title,
    h1_count: h1s.length,
    h1_texts: h1s.map((h) => (h.textContent || '').trim().slice(0, 80)).slice(0, 5),
    meta_description: metaEl ? (metaEl.getAttribute('content') || '') : null,
    placeholderLinks, emptyLinks, vagueLinks, brokenAnchors, undisclosedNewTabLinks, headingsAndLabels,
    fieldsetsNoLegend, orphanLabels, misusedLabels, lowContrastControls,
    fieldsWithoutInstructions, formsWithoutHelp,
    sensoryLanguage, visualOnlyElements, keyboardInaccessible, helpMechanisms, sequenceRisks, tabOrderRisks,
    dragElements, duplicateFormFields, movingContent, interruptionElements,
    timeLimitCandidate: timeLimitElement ? { selector: selectorFor(timeLimitElement), text: (timeLimitElement.innerText || '').trim().slice(0, 300), html: timeLimitElement.outerHTML.slice(0, 1000) } : null,
    abbreviationsWithoutMeaning, unusualWordCandidates, imageTextCandidates, visualPresentationRisks, flashCandidates,
    largeControlCandidates, navigationRegions, inconsistentComponents, wayCount,
    table_count: tables.length,
    tables_without_summary: tables.filter((t) => !t.getAttribute('summary') && !t.getAttribute('aria-describedby')).length,
    favicons,
    has_significant_media: !!(mainEl && mainEl.querySelector('video,iframe,canvas')),
  };
}
"""


# B12 placeholder links (scored, info)
def check_placeholder_links(signals: dict) -> list[dict]:
    links = signals.get("placeholderLinks") or []
    return [
        _rec(
            "placeholder_links", "content", "Broken links", "info",
            "Placeholder link may not go anywhere",
            "Point this link at a real destination or use a <button> for an action.",
            selector=link.get("selector"), html_snippet=link,
        )
        for link in links[:100]
    ]


# B13 structured data (assisted)
def check_structured_data(signals: dict) -> list[dict]:
    if signals.get("_json_ld") or signals.get("_microdata"):
        return []
    return [_rec(
        "structured_data_missing", "marketing", "Technical optimization", "warning",
        "No structured data (JSON-LD or microdata) found",
        "Add schema.org structured data so search engines can render rich results.",
        manual_review=True,
        html_snippet={"json_ld_found": bool(signals.get("_json_ld")), "microdata_found": bool(signals.get("_microdata"))},
    )]


# B16 URL file extension (scored, warning)
def check_url_file_extension(page_url: str) -> list[dict]:
    path = urlparse(page_url).path.lower()
    ext = next((e for e in _URL_EXTENSIONS if path.endswith(e)), None)
    if not ext:
        return []
    return [_rec(
        "url_file_extension", "marketing", "Technical optimization", "warning",
        f"Page URL ends in a file extension ({ext})",
        "Use extensionless, human-readable URLs; they are cleaner and more portable.",
        html_snippet={"url": page_url, "extension": ext},
    )]


# B17 underscores in URL (assisted)
def check_url_underscores(page_url: str) -> list[dict]:
    path = urlparse(page_url).path
    n = path.count("_")
    if n == 0:
        return []
    return [_rec(
        "url_underscores", "marketing", "Technical optimization", "info",
        "URL path contains underscores",
        "Prefer hyphens over underscores in URLs; search engines treat hyphens as word separators.",
        manual_review=True,
        html_snippet={"url": page_url, "underscores_count": n},
    )]


# B18 thin pages (scored, info)
def check_thin_pages(signals: dict, word_count: int) -> list[dict]:
    if word_count >= _THIN_WORDS or signals.get("has_significant_media"):
        return []
    return [_rec(
        "thin_pages", "content", "Content SEO", "info",
        f"Thin page — only {word_count} words and no significant media",
        "Add substantive content; very thin pages rank poorly and offer little to visitors.",
        html_snippet={"word_count": word_count},
    )]


# B19 title too long (scored, info)
def check_title_length(signals: dict) -> list[dict]:
    title = signals.get("title") or ""
    if len(title) <= _TITLE_MAX:
        return []
    return [_rec(
        "title_too_long", "marketing", "Content optimization", "info",
        f"Page title is {len(title)} characters (over {_TITLE_MAX})",
        f"Keep titles under {_TITLE_MAX} characters so they aren't truncated in search results.",
        html_snippet={"title": title, "length": len(title)},
    )]


# B20 multiple H1 (scored, info)
def check_multiple_h1(signals: dict) -> list[dict]:
    n = signals.get("h1_count") or 0
    if n <= 1:
        return []
    return [_rec(
        "multiple_h1", "content", "Content SEO", "info",
        f"Page has {n} <h1> headings",
        "Use a single <h1> per page as the main topic; use <h2>–<h6> for subsections.",
        html_snippet={"h1_count": n, "h1_texts": signals.get("h1_texts", [])},
    )]


# B21 meta description too short (scored, info)
def check_meta_description_length(signals: dict) -> list[dict]:
    desc = signals.get("meta_description")
    if desc is None or len(desc) >= _META_MIN:
        return []
    return [_rec(
        "meta_description_too_short", "content", "Page information", "info",
        f"Meta description is only {len(desc)} characters (under {_META_MIN})",
        f"Write a meta description of at least {_META_MIN} characters that summarizes the page.",
        html_snippet={"description": desc, "length": len(desc)},
    )]


def check_new_tab_disclosure(signals: dict) -> list[dict]:
    out = []
    for link in signals.get("undisclosedNewTabLinks") or []:
        out.append(_rec(
            "new_tab_disclosure", "content", "Links", "info",
            "Link opens in a new tab without explaining that behavior",
            "Tell users in the visible or accessible link text that the destination opens in a new tab.",
            selector=link.get("selector"), html_snippet=link,
        ))
    return out


def check_headings_labels_descriptive(signals: dict) -> list[dict]:
    items = signals.get("headingsAndLabels") or []
    text_counts: dict[str, int] = {}
    for item in items:
        text = re.sub(r"\s+", " ", item.get("text") or "").strip().casefold()
        if text:
            text_counts[text] = text_counts.get(text, 0) + 1
    findings = []
    for item in items[:200]:
        text = re.sub(r"\s+", " ", item.get("text") or "").strip()
        normalized = text.casefold()
        reason = None
        if not text:
            reason = "empty"
        elif normalized in _VAGUE_HEADING_LABELS or re.fullmatch(r"(?:section|item|heading|content)\s*\d*", normalized):
            reason = "vague"
        elif item.get("element", "").startswith("h") and text_counts.get(normalized, 0) > 1:
            reason = "duplicated"
        if not reason:
            continue
        findings.append(_rec(
            "headings_labels_descriptive", "content", "Structure", "info",
            f"{item.get('element', 'Heading or label')} text is {reason}: {text or '(empty)'}",
            "Rewrite this heading or label so its topic or control purpose is clear when read out of context.",
            manual_review=True, selector=item.get("selector"), html_snippet={**item, "reason": reason},
        ))
    return findings


def check_text_conveys_information(signals: dict) -> list[dict]:
    findings = []
    for candidate in (signals.get("sensoryLanguage") or [])[:50]:
        findings.append(_rec(
            "text_conveys_information", "content", "Content accessibility", "info",
            "Instructions may rely only on color, shape, or position",
            "Add a textual name or state so users do not need to perceive color, shape, or position to understand the instruction.",
            manual_review=True, selector=candidate.get("selector"), html_snippet=candidate,
        ))
    for candidate in (signals.get("visualOnlyElements") or [])[:50]:
        findings.append(_rec(
            "text_conveys_information", "content", "Content accessibility", "info",
            f"Visible {candidate.get('element', 'graphic')} may convey information without text",
            "Provide an accessible textual equivalent, or explicitly mark the graphic decorative when it conveys no information.",
            manual_review=True, selector=candidate.get("selector"), html_snippet=candidate,
        ))
    return findings


# B22 table summary (assisted)
def check_table_summary(signals: dict) -> list[dict]:
    without = signals.get("tables_without_summary") or 0
    if without == 0:
        return []
    return [_rec(
        "table_summary", "accessibility", "Content accessibility", "info",
        f"{without} table(s) without a summary or aria-describedby",
        "Consider adding a caption/summary or aria-describedby to describe complex tables.",
        manual_review=True,
        html_snippet={"table_count": signals.get("table_count", 0), "tables_without_summary": without},
    )]


# B23 favicons (assisted)
def check_favicons(signals: dict) -> list[dict]:
    favicons = signals.get("favicons") or []
    if not favicons:
        return []
    return [_rec(
        "favicon_review", "ux", "Functionality", "warning",
        "Review favicons for brand compliance",
        "Confirm the site uses an approved favicon across all pages.",
        manual_review=True,
        html_snippet={"favicons": favicons[:10]},
    )]


def _wcag(rec: dict, version: str, level: str, criterion_id: str, name: str) -> dict:
    rec.update(wcag_version=version, wcag_level=level, criterion_id=criterion_id, criterion_name=name)
    return rec


# A fieldset groups controls; without a legend the group has no accessible name.
def check_fieldset_legend(signals: dict) -> list[dict]:
    return [
        _wcag(_rec(
            "fieldset_legend", "accessibility", "Forms", "warning",
            "Fieldset has no legend",
            "Give every <fieldset> a <legend> as its first child so screen readers can announce "
            "what the grouped controls belong to.",
            selector=fs.get("selector"), html_snippet={"html": fs.get("html", "")},
        ), "2.0", "A", "1.3.1", "Info and Relationships")
        for fs in (signals.get("fieldsetsNoLegend") or [])[:50]
    ]


# label[for] pointing at nothing labels nothing.
def check_label_orphan_for(signals: dict) -> list[dict]:
    return [
        _wcag(_rec(
            "label_orphan_for", "accessibility", "Forms", "warning",
            f'Label "for" points to id "{lb.get("for")}" which does not exist',
            "Point the label's for attribute at the id of the control it labels, or wrap the control "
            "in the label.",
            selector=lb.get("selector"),
            html_snippet={"for": lb.get("for", ""), "text": lb.get("text", "")},
        ), "2.0", "A", "1.3.1", "Info and Relationships")
        for lb in (signals.get("orphanLabels") or [])[:50]
    ]


# A label attached to something that cannot be labelled is ignored by assistive tech.
def check_label_misuse(signals: dict) -> list[dict]:
    out = []
    for lb in (signals.get("misusedLabels") or [])[:50]:
        target = lb.get("target_tag")
        description = (
            f'Label is attached to a <{target}>, which cannot take a label'
            if target else "Label does not label any form control"
        )
        out.append(_wcag(_rec(
            "label_misuse", "accessibility", "Forms", "warning",
            description,
            "Use <label> only for form controls. For other text, use a heading, <span>, or "
            "aria-labelledby instead.",
            selector=lb.get("selector"),
            html_snippet={"for": lb.get("for") or "", "target_tag": target or "", "text": lb.get("text", "")},
        ), "2.0", "A", "1.3.1", "Info and Relationships"))
    return out


# 1.4.11: a control with no border, no background of its own and no outline has no
# visible boundary to contrast against the page. Assisted — the eye is the judge.
def check_control_contrast(signals: dict) -> list[dict]:
    return [
        _wcag(_rec(
            "control_contrast", "accessibility", "Forms", "warning",
            f'<{c.get("tag")}> control has no visible boundary against its surroundings',
            "Give the control a border, background, or outline that contrasts at least 3:1 with "
            "the surrounding page so its boundary is perceivable.",
            manual_review=True, selector=c.get("selector"),
            html_snippet={"tag": c.get("tag", ""), "type": c.get("type", ""), "html": c.get("html", "")},
        ), "2.1", "AA", "1.4.11", "Non-text Contrast")
        for c in (signals.get("lowContrastControls") or [])[:50]
    ]


# 3.3.2: a field that constrains what it accepts should say so before submission.
def check_field_instructions(signals: dict) -> list[dict]:
    return [
        _wcag(_rec(
            "field_instructions", "accessibility", "Forms", "warning",
            f'Field "{f.get("name") or f.get("type")}" restricts its input without saying how',
            "Describe the expected format or requirement in the label, or reference hint text with "
            "aria-describedby, so the rule is known before the field is submitted.",
            manual_review=True, selector=f.get("selector"),
            html_snippet={"name": f.get("name", ""), "type": f.get("type", "")},
        ), "2.0", "A", "3.3.2", "Labels or Instructions")
        for f in (signals.get("fieldsWithoutInstructions") or [])[:50]
    ]


# 3.3.5: a form should offer a way to get help with what it is asking for.
def check_context_sensitive_help(signals: dict) -> list[dict]:
    return [
        _wcag(_rec(
            "context_sensitive_help", "accessibility", "Forms", "info",
            f'Form with {f.get("fields", 0)} field(s) offers no help or contact route',
            "Provide context-sensitive help near the form — a help link, contact details, or "
            "explanatory text — so users who get stuck can complete it.",
            manual_review=True, selector=f.get("selector"),
            html_snippet={"fields": f.get("fields", 0)},
        ), "2.0", "AAA", "3.3.5", "Help")
        for f in (signals.get("formsWithoutHelp") or [])[:20]
    ]


# Link purpose: a filler link name gives no clue where it goes (WCAG 2.0 A 2.4.4).
def check_link_purpose_unclear(signals: dict) -> list[dict]:
    out = []
    for lk in signals.get("vagueLinks") or []:
        rec = _rec(
            "link_purpose_unclear", "content", "Links", "warning",
            f'Link text "{(lk.get("text") or "").strip() or "(unnamed)"}" does not describe its destination',
            "Write link text that makes the destination clear on its own, or add an aria-label that does.",
            selector=lk.get("selector"),
            html_snippet={"text": lk.get("text", ""), "href": lk.get("href", ""), "html": lk.get("html", "")},
        )
        rec.update(
            wcag_version="2.0", wcag_level="A",
            criterion_id="2.4.4", criterion_name="Link Purpose (In Context)",
        )
        out.append(rec)
    return out[:100]


# B28 empty links (assisted — scored a11y integration deferred to calibration)
def check_link_no_text(signals: dict) -> list[dict]:
    out = []
    for lk in signals.get("emptyLinks") or []:
        out.append(_rec(
            "link_no_text", "accessibility", "Content accessibility", "info",
            "Link has no discernible text",
            "Give the link visible text, an aria-label, a title, or alt text on a contained image.",
            manual_review=True, selector=lk.get("selector"),
            html_snippet={"selector": lk.get("selector", ""), "href": lk.get("href", "")},
        ))
    return out


# B29 broken in-page anchors (assisted — scored a11y integration deferred)
def check_broken_anchor_links(signals: dict) -> list[dict]:
    out = []
    for a in signals.get("brokenAnchors") or []:
        out.append(_rec(
            "broken_anchor_links", "accessibility", "Content accessibility", "warning",
            "In-page link points to an anchor that does not exist",
            "Fix the fragment target so the in-page link scrolls to a real element id.",
            manual_review=True, selector=a.get("selector"),
            html_snippet={"href": a.get("href", ""), "missing_id": a.get("missing_id", ""), "selector": a.get("selector", "")},
        ))
    return out


def check_keyboard_functionality(signals: dict) -> list[dict]:
    return [_rec(
        "keyboard_functionality", "accessibility", "Keyboard", "error",
        "Clickable element is not natively keyboard operable",
        "Use a native button or link, or add the correct role, keyboard event handling, and focusability.",
        selector=item.get("selector"), html_snippet=item,
    ) for item in (signals.get("keyboardInaccessible") or [])[:100]]


def check_consistent_help(signals: dict) -> list[dict]:
    return [_rec(
        "consistent_help", "accessibility", "Navigation", "info",
        "Review this help mechanism for consistent placement across pages",
        "Keep repeated help mechanisms in the same relative order and location throughout the website.",
        manual_review=True, selector=item.get("selector"), html_snippet=item,
    ) for item in (signals.get("helpMechanisms") or [])[:50]]


def check_accessible_page_title(signals: dict) -> list[dict]:
    title = re.sub(r"\s+", " ", signals.get("title") or "").strip()
    generic = title.casefold() in {"home", "homepage", "untitled", "new page", "document"}
    if title and len(title) >= 4 and not generic:
        return []
    return [_rec(
        "page_title_accessibility", "accessibility", "Navigation", "warning",
        "Page title is missing or does not adequately describe the page",
        "Add a concise, unique document title that describes this page's topic or purpose.",
        html_snippet={"title": title, "reason": "generic" if generic else "missing or too short"},
    )]


def check_meaningful_sequence(signals: dict) -> list[dict]:
    return [_rec(
        "meaningful_sequence", "accessibility", "Structure", "info",
        "Visual or focus order may differ from the HTML sequence",
        "Keep the DOM in a meaningful reading order and avoid CSS order or positive tabindex values that change its meaning.",
        manual_review=True, selector=item.get("selector"), html_snippet=item,
    ) for item in (signals.get("sequenceRisks") or [])[:100]]


def _manual_candidates(signals: dict, signal: str, rule_id: str, subcategory: str,
                       description: str, remediation: str, *, severity: str = "info") -> list[dict]:
    return [_rec(
        rule_id, "accessibility", subcategory, severity, description, remediation,
        manual_review=True, selector=item.get("selector"), html_snippet=item,
    ) for item in (signals.get(signal) or [])[:100]]


def check_redundant_entry(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "duplicateFormFields", "redundant_entry", "Forms",
        "A form may ask for the same information more than once",
        "Auto-populate repeated information or let the user select previously entered information.")


def check_drag_alternative(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "dragElements", "drag_alternative", "Input",
        "Drag-and-drop interaction needs a non-dragging alternative",
        "Provide buttons, menus, or another single-pointer method that performs the same action.")


def check_time_limits(signals: dict) -> list[dict]:
    candidate = signals.get("timeLimitCandidate")
    if not candidate:
        return []
    shared = dict(candidate)
    return [
        _rec("inactivity_data_loss", "accessibility", "Timing", "info",
             "Page content suggests an inactivity timeout", "Warn users before timeout and preserve entered data.",
             manual_review=True, selector=shared.get("selector"), html_snippet=shared),
        _rec("timing_not_essential", "accessibility", "Timing", "info",
             "Page content appears to use a time limit", "Provide an untimed alternative unless timing is essential.",
             manual_review=True, selector=shared.get("selector"), html_snippet=shared),
    ]


def check_pause_animated_content(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "movingContent", "pause_animated_content", "Timing",
        "Moving or auto-playing content may need pause, stop, or hide controls",
        "Add controls for content that moves, blinks, scrolls, or updates automatically for more than five seconds.", severity="warning")


def check_unusual_words(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "unusualWordCandidates", "unusual_words_definitions", "Readable",
        "A marked specialist term does not expose a definition",
        "Link the term to a glossary or provide its definition with title or aria-describedby.")


def check_visual_presentation(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "visualPresentationRisks", "visual_presentation_text", "Adaptable",
        "Inline important text styles may prevent user presentation overrides",
        "Avoid locking text presentation with !important; support user colors, spacing, width, and text-size overrides.")


def check_interruptions(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "interruptionElements", "interruptions_suppressible", "Timing",
        "Assertive or modal content may interrupt the user",
        "Allow non-emergency alerts and interruptions to be postponed or suppressed.")


def check_large_controls(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "largeControlCandidates", "large_interactive_controls", "Input",
        "Interactive control is smaller than the enhanced 44 by 44 CSS pixel target",
        "Increase the control or its clickable area to at least 44 by 44 CSS pixels where possible.")


def check_consistent_navigation(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "navigationRegions", "consistent_navigation", "Navigation",
        "Review this repeated navigation region for consistent order across pages",
        "Keep repeated navigation mechanisms in the same relative order on every page.")


def check_abbreviations(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "abbreviationsWithoutMeaning", "abbreviations_meaning", "Readable",
        "Abbreviation does not provide its expanded meaning",
        "Expand it on first use or provide the expansion with a title or linked definition.")


def check_images_of_text(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "imageTextCandidates", "images_of_text", "Images",
        "Image may contain meaningful text",
        "Use real text; keep an image of text only when it is decorative or essential to the presentation.")


def check_custom_tab_order(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "tabOrderRisks", "custom_tab_order", "Keyboard",
        "Positive tabindex creates a custom focus order",
        "Use DOM order and tabindex=0 so focus follows a logical sequence.")


def check_flashing_content(signals: dict) -> list[dict]:
    findings = []
    for item in (signals.get("flashCandidates") or [])[:50]:
        for rule_id, description, remediation in (
            ("three_flashes_a", "Media or canvas content needs a three-flash threshold review", "Measure flashes and keep them below the general and red-flash thresholds."),
            ("flashing_content_aaa", "Media or canvas content needs an enhanced flashing-content review", "Ensure it never flashes more than three times in any one-second period."),
        ):
            findings.append(_rec(rule_id, "accessibility", "Seizures", "info", description, remediation,
                manual_review=True, selector=item.get("selector"), html_snippet=item))
    return findings


def check_consistent_identification(signals: dict) -> list[dict]:
    return _manual_candidates(signals, "inconsistentComponents", "consistent_identification", "Predictable",
        "Links to the same destination use different names",
        "Use consistent names and accessible labels for components with the same function.")


def check_multiple_ways(signals: dict) -> list[dict]:
    ways = int(signals.get("wayCount") or 0)
    if ways >= 2:
        return []
    return [_rec(
        "multiple_ways", "accessibility", "Navigation", "info",
        "Fewer than two page-location mechanisms were detected",
        "Provide another way to locate pages, such as search, a sitemap, or a comprehensive navigation list.",
        manual_review=True, html_snippet={"detected_way_count": ways},
    )]


async def extract_dom_signals_b2(page) -> dict:
    try:
        sig = await page.evaluate(_DOM_SIGNALS_B2_JS)
    except Exception:
        return {}
    # Structured-data presence is cheap to check separately for clarity.
    try:
        sig["_json_ld"] = await page.evaluate("() => !!document.querySelector('script[type=\"application/ld+json\"]')")
        sig["_microdata"] = await page.evaluate("() => !!document.querySelector('[itemscope],[itemtype]')")
    except Exception:
        sig["_json_ld"] = sig["_microdata"] = False
    return sig


def run_dom_checks_b2(signals: dict, page_url: str, word_count: int) -> list[dict]:
    """Sub-batch-2 pure-DOM / URL checks for one page."""
    if not signals:
        return []
    findings: list[dict] = []
    steps = [
        lambda: check_placeholder_links(signals),
        lambda: check_new_tab_disclosure(signals),
        lambda: check_headings_labels_descriptive(signals),
        lambda: check_text_conveys_information(signals),
        lambda: check_structured_data(signals),
        lambda: check_url_file_extension(page_url),
        lambda: check_url_underscores(page_url),
        lambda: check_title_length(signals),
        lambda: check_meta_description_length(signals),
        lambda: check_table_summary(signals),
        lambda: check_favicons(signals),
        lambda: check_link_no_text(signals),
        lambda: check_link_purpose_unclear(signals),
        lambda: check_fieldset_legend(signals),
        lambda: check_label_orphan_for(signals),
        lambda: check_label_misuse(signals),
        lambda: check_control_contrast(signals),
        lambda: check_field_instructions(signals),
        lambda: check_context_sensitive_help(signals),
        lambda: check_broken_anchor_links(signals),
        lambda: check_keyboard_functionality(signals),
        lambda: check_consistent_help(signals),
        lambda: check_accessible_page_title(signals),
        lambda: check_meaningful_sequence(signals),
        lambda: check_redundant_entry(signals),
        lambda: check_drag_alternative(signals),
        lambda: check_time_limits(signals),
        lambda: check_pause_animated_content(signals),
        lambda: check_unusual_words(signals),
        lambda: check_visual_presentation(signals),
        lambda: check_interruptions(signals),
        lambda: check_large_controls(signals),
        lambda: check_consistent_navigation(signals),
        lambda: check_abbreviations(signals),
        lambda: check_images_of_text(signals),
        lambda: check_custom_tab_order(signals),
        lambda: check_flashing_content(signals),
        lambda: check_consistent_identification(signals),
        lambda: check_multiple_ways(signals),
    ]
    for step in steps:
        try:
            findings += step()
        except Exception:
            logger.exception("a dom(b2) check failed")
    return findings
