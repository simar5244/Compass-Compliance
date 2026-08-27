"""Shadow-DOM-aware DOM serialization and link extraction.

Why this matters: Salesforce LWC, and any site built on web components, put their
real markup inside `element.shadowRoot`. `element.outerHTML` and a plain
`a[href]` query both stop at the shadow boundary, so a naive scraper sees an
empty `<c-my-component></c-my-component>` shell — no content, no links. Both
functions below recurse through every open shadow root so components serialize
and their links are discovered.

Everything runs in the page via `page.evaluate`; we never touch `response.text()`.
"""

from __future__ import annotations

from typing import Any

from playwright.async_api import Page

# --- Link discovery (shadow-aware) ---------------------------------------------
#
# Collects, from the light DOM and every open shadow root:
#   * <a href> and <area href>              (resolved to absolute .href)
#   * [role=link] with a detectable target  (href / data-href / data-url)
#   * elements exposing data-href / data-url (common SPA click-nav pattern)
# Returns absolute URL strings; the frontier normalizes and filters them.
_EXTRACT_LINKS_JS = r"""
() => {
  const out = new Set();
  const abs = (v) => { try { return new URL(v, document.baseURI).href; } catch { return null; } };

  const collectFrom = (root) => {
    // Anchors / areas with a real href resolve via the .href IDL attribute.
    root.querySelectorAll('a[href], area[href]').forEach((el) => {
      if (el.href) out.add(el.href);
    });
    // role=link and data-driven nav targets.
    root.querySelectorAll('[role="link"], [data-href], [data-url]').forEach((el) => {
      const cand = el.getAttribute('href') || el.dataset?.href || el.dataset?.url;
      if (cand) { const a = abs(cand); if (a) out.add(a); }
    });
    // Recurse into open shadow roots.
    root.querySelectorAll('*').forEach((el) => {
      if (el.shadowRoot) collectFrom(el.shadowRoot);
    });
  };

  collectFrom(document);
  return Array.from(out);
}
"""

# --- Anchor link geometry (best-effort) ----------------------------------------
#
# Collects all <a href> elements (including inside open shadow roots) and returns
# per-occurrence data the broken-links check can use for Inspector overlays:
#   { url, text, selector, bbox }
#
# This intentionally does NOT dedupe by URL so we can compute occurrence counts.
_EXTRACT_ANCHOR_LINKS_JS = r"""
() => {
  const abs = (v) => { try { return new URL(v, document.baseURI).href; } catch { return null; } };
  const clip = (s, n) => (s || '').trim().replace(/\s+/g, ' ').slice(0, n);

  const seg = (n) => {
    let s = n.tagName ? n.tagName.toLowerCase() : n.nodeName;
    if (n.id) return s + '#' + n.id;
    if (n.parentNode) {
      const sib = Array.from(n.parentNode.children).filter(c => c.tagName === n.tagName);
      if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(n) + 1})`;
    }
    return s;
  };
  const cssPath = (el) => {
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 10) {
      parts.unshift(seg(node));
      const root = node.getRootNode();
      if (root instanceof ShadowRoot) { parts.unshift('>>'); node = root.host; }
      else node = node.parentElement;
    }
    return parts.join(' > ').replace(/> >> >/g, '>>');
  };

  const bbox = (el) => {
    const r = el.getBoundingClientRect();
    if (!r || (r.width === 0 && r.height === 0)) return null;
    return {
      x: Math.round(r.x + window.scrollX),
      y: Math.round(r.y + window.scrollY),
      width: Math.round(r.width),
      height: Math.round(r.height),
    };
  };

  const out = [];
  const collectFrom = (root) => {
    root.querySelectorAll('a[href]').forEach((el) => {
      const href = el.getAttribute('href') || '';
      const url = abs(href);
      if (!url) return;
      out.push({
        url,
        text: clip(el.innerText, 100),
        selector: cssPath(el),
        bbox: bbox(el),
      });
    });
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) collectFrom(el.shadowRoot); });
  };

  collectFrom(document);
  return out;
}
"""

# --- Serialization (shadow-aware) ----------------------------------------------
#
# Emits the rendered markup with each open shadow root inlined inside a
# <template shadowrootmode="open">...</template>, the standard declarative-shadow
# representation. The result is a faithful snapshot of what the user actually saw.
_SERIALIZE_JS = r"""
() => {
  const serializeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      return node.textContent.replace(/[<>&]/g, (c) => (
        { '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c]
      ));
    }
    if (node.nodeType === Node.COMMENT_NODE) return `<!--${node.textContent}-->`;
    if (node.nodeType !== Node.ELEMENT_NODE) return '';

    const tag = node.tagName.toLowerCase();
    const attrs = Array.from(node.attributes || [])
      .map((a) => ` ${a.name}="${(a.value || '').replace(/"/g, '&quot;')}"`)
      .join('');

    const voidEls = new Set(['area','base','br','col','embed','hr','img','input',
      'link','meta','param','source','track','wbr']);
    if (voidEls.has(tag)) return `<${tag}${attrs}>`;

    let inner = '';
    if (node.shadowRoot) {
      let shadowInner = '';
      node.shadowRoot.childNodes.forEach((c) => { shadowInner += serializeNode(c); });
      inner += `<template shadowrootmode="open">${shadowInner}</template>`;
    }
    node.childNodes.forEach((c) => { inner += serializeNode(c); });
    return `<${tag}${attrs}>${inner}</${tag}>`;
  };

  const doctype = document.doctype ? '<!DOCTYPE html>' : '';
  return doctype + serializeNode(document.documentElement);
}
"""


async def extract_links(page: Page) -> list[str]:
    """Absolute URLs discovered in the live DOM, including inside open shadow roots."""
    result: Any = await page.evaluate(_EXTRACT_LINKS_JS)
    return list(result) if result else []


async def extract_anchor_links(page: Page) -> list[dict]:
    """Per-occurrence anchor link metadata for broken-link Inspector overlays."""
    result: Any = await page.evaluate(_EXTRACT_ANCHOR_LINKS_JS)
    return list(result) if result else []


async def serialize_dom(page: Page) -> str:
    """The rendered DOM as an HTML string, with open shadow roots inlined."""
    return await page.evaluate(_SERIALIZE_JS)
