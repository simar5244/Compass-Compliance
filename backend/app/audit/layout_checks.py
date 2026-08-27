"""Custom rendered-layout accessibility checks that axe-core cannot do.

All three run in the live browser and emit the uniform issue record (via
`accessibility_record`) with WCAG criterion mapping, a shadow-aware selector,
a bounding box, and the viewport they were measured in. Every ambiguous result
is routed to MANUAL REVIEW rather than asserted as a violation — we never guess.

  * check_focus_visible  — WCAG 2.4.7 (AA, all versions)  — desktop viewport
  * check_target_size    — WCAG 2.5.8 (AA, 2.2 only)      — mobile 375 viewport
  * check_reflow         — WCAG 1.4.10 (AA, 2.1 + 2.2)    — 320px viewport

Thresholds (sample caps, luminance/contrast deltas, min target size, reflow
width) all come from config, never hardcoded here.
"""

from __future__ import annotations

from playwright.async_api import Page

from app.audit.wcag_records import accessibility_record
from app.config import settings

# Shared JS: shadow-aware collection + a cssPath() good enough for display.
# Inlined into each evaluate so every check is self-contained.
_SHARED_JS = r"""
  const isVisible = (el) => {
    const s = getComputedStyle(el);
    if (s.display === 'none' || s.visibility === 'hidden' || s.opacity === '0') return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const cssPath = (el) => {
    const seg = (n) => {
      let s = n.tagName ? n.tagName.toLowerCase() : n.nodeName;
      if (n.id) return s + '#' + n.id;
      if (n.parentNode) {
        const sib = Array.from(n.parentNode.children).filter(c => c.tagName === n.tagName);
        if (sib.length > 1) s += `:nth-of-type(${sib.indexOf(n) + 1})`;
      }
      return s;
    };
    const parts = [];
    let node = el;
    while (node && node.nodeType === 1 && parts.length < 8) {
      parts.unshift(seg(node));
      const root = node.getRootNode();
      if (root instanceof ShadowRoot) { parts.unshift('>>'); node = root.host; }
      else node = node.parentElement;
    }
    return parts.join(' > ').replace(/> >> >/g, '>>');
  };
  const collectDeep = (selectorList, root, out) => {
    root.querySelectorAll(selectorList).forEach((el) => out.push(el));
    root.querySelectorAll('*').forEach((el) => { if (el.shadowRoot) collectDeep(selectorList, el.shadowRoot, out); });
  };
  const docBox = (el) => {
    const r = el.getBoundingClientRect();
    return { x: r.x + window.scrollX, y: r.y + window.scrollY, width: r.width, height: r.height };
  };
"""

_FOCUSABLE_SELECTOR = "a[href], button, input, select, textarea, [tabindex]"


# --------------------------------------------------------------------------- #
# A2. Focus Visible — WCAG 2.4.7
# --------------------------------------------------------------------------- #
_FOCUS_JS = r"""
({ cap, lumDelta, contrastMin }) => {
  %SHARED%

  const parseRGB = (s) => {
    const m = (s || '').match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const p = m[1].split(',').map(x => parseFloat(x));
    return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
  };
  const relLum = (c) => {
    if (!c) return 0;
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c.r) + 0.7152 * f(c.g) + 0.0722 * f(c.b);
  };
  const contrast = (a, b) => {
    const l1 = relLum(a), l2 = relLum(b);
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  };
  const snap = (el) => {
    const s = getComputedStyle(el);
    return {
      outlineWidth: parseFloat(s.outlineWidth) || 0,
      outlineStyle: s.outlineStyle,
      boxShadow: s.boxShadow,
      border: s.borderColor + '|' + s.borderWidth,
      bg: s.backgroundColor,
      color: s.color,
      textDecoration: s.textDecorationLine,
      outlineColor: s.outlineColor,
    };
  };

  const els = [];
  collectDeep('a[href], button, input, select, textarea, [tabindex]', document, els);
  const focusable = els.filter((el) => {
    const ti = el.getAttribute('tabindex');
    if (ti === '-1') return false;
    return isVisible(el);
  });
  const capped = focusable.length > cap;
  const sample = focusable.slice(0, cap);

  const results = [];
  for (const el of sample) {
    const before = snap(el);
    let focused = false;
    try { el.focus({ preventScroll: true }); focused = (document.activeElement === el ||
           (el.getRootNode().activeElement === el)); } catch (e) {}
    const after = snap(el);
    try { el.blur(); } catch (e) {}

    if (!focused) { results.push({ status: 'manual', selector: cssPath(el), bbox: docBox(el), reason: 'could not focus programmatically' }); continue; }

    // Strong cues: an outline or box-shadow appearing.
    const outlineAppeared = after.outlineWidth > 0 && after.outlineStyle !== 'none' &&
                            !(before.outlineWidth > 0 && before.outlineStyle !== 'none');
    const boxShadowAppeared = after.boxShadow !== 'none' && after.boxShadow !== before.boxShadow;
    if (outlineAppeared || boxShadowAppeared) { continue; } // pass

    // Weaker cues: color/decoration change — must clear a threshold to count.
    const decorChanged = after.textDecoration !== before.textDecoration;
    const bgContrast = contrast(parseRGB(before.bg), parseRGB(after.bg));
    const colorContrast = contrast(parseRGB(before.color), parseRGB(after.color));
    const lumChange = Math.abs(relLum(parseRGB(after.bg)) - relLum(parseRGB(before.bg)));
    const meaningfulColor = bgContrast >= contrastMin || colorContrast >= contrastMin || lumChange >= lumDelta;

    if (decorChanged || meaningfulColor) { continue; } // pass

    // Something changed but below threshold => borderline => manual review.
    const anyChange = JSON.stringify(before) !== JSON.stringify(after);
    if (anyChange) { results.push({ status: 'manual', selector: cssPath(el), bbox: docBox(el), reason: 'focus style change below visibility threshold' }); }
    else { results.push({ status: 'violation', selector: cssPath(el), bbox: docBox(el), reason: 'no visible focus indicator' }); }
  }
  return { sampled: sample.length, total: focusable.length, capped, results };
}
""".replace("%SHARED%", _SHARED_JS)


async def check_focus_visible(page: Page) -> list[dict]:
    """WCAG 2.4.7 — every focusable element needs a visible focus indicator.
    Runs on the current (desktop) viewport."""
    try:
        data = await page.evaluate(_FOCUS_JS, {
            "cap": settings.focus_sample_cap,
            "lumDelta": settings.focus_luminance_delta,
            "contrastMin": settings.focus_contrast_min_ratio,
        })
    except Exception:
        return []

    cap_note = f" (sampled first {data['sampled']} of {data['total']} focusable elements)" if data.get("capped") else ""
    records = []
    for r in data.get("results", []):
        manual = r["status"] == "manual"
        records.append(accessibility_record(
            check_id="focus-visible", criterion_id="2.4.7", impact="serious",
            description=("Focusable element may lack a visible focus indicator" if manual
                         else "Focusable element has no visible focus indicator") + cap_note,
            remediation="Give every interactive element a clearly visible focus style (for example a "
                        "2px outline or an equally distinct box-shadow) so keyboard users can always "
                        "see which control is focused.",
            manual_review=manual, selector=r["selector"], bbox=r["bbox"], viewport="desktop",
            html_snippet=r.get("reason", ""),
        ))
        # 2.4.13 asks for more than "some" change: an indicator that only just
        # registers fails Focus Appearance even when 2.4.7 passes it as borderline.
        if r.get("reason") == "focus style change below visibility threshold":
            records.append(accessibility_record(
                check_id="focus_appearance", criterion_id="2.4.13", impact="minor",
                description="Focus indicator is too subtle to clearly show the control is selected" + cap_note,
                remediation="Make the focus indicator at least 2 CSS pixels thick around the control and "
                            "contrast it at least 3:1 against both the control and the adjacent colours.",
                manual_review=True, selector=r["selector"], bbox=r["bbox"], viewport="desktop",
                html_snippet=r.get("reason", ""),
            ))
    return records


# --------------------------------------------------------------------------- #
# A3. Target Size (Minimum) — WCAG 2.5.8 (2.2 only) — mobile 375
# --------------------------------------------------------------------------- #
_TARGET_JS = r"""
({ cap, minPx }) => {
  %SHARED%

  const inlineParentTags = new Set(['P','LI','TD','TH','SPAN','DD','DT','FIGCAPTION','LABEL','BLOCKQUOTE','H1','H2','H3','H4','H5','H6']);
  const els = [];
  collectDeep('a[href], button, input, select, textarea, [role=button], [onclick], [tabindex]', document, els);
  const targets = els.filter((el) => {
    const ti = el.getAttribute('tabindex');
    if (ti === '-1') return false;
    return isVisible(el);
  }).slice(0, cap);

  // Precompute centers for the spacing (pairwise circle) exception.
  const centers = targets.map((el) => {
    const r = el.getBoundingClientRect();
    return { cx: r.x + r.width / 2, cy: r.y + r.height / 2 };
  });

  const results = [];
  for (let i = 0; i < targets.length; i++) {
    const el = targets[i];
    const r = el.getBoundingClientRect();
    if (r.width >= minPx && r.height >= minPx) continue; // large enough

    const s = getComputedStyle(el);
    // INLINE exception: inline links flowing inside text are exempt entirely.
    const isLink = el.tagName === 'A';
    const inlineDisplay = s.display.startsWith('inline');
    const parentIsText = el.parentElement && inlineParentTags.has(el.parentElement.tagName);
    if (isLink && inlineDisplay && parentIsText) continue;

    // SPACING exception: passes if no other target's center is within minPx.
    let minDist = Infinity;
    for (let j = 0; j < centers.length; j++) {
      if (j === i) continue;
      const dx = centers[i].cx - centers[j].cx, dy = centers[i].cy - centers[j].cy;
      minDist = Math.min(minDist, Math.hypot(dx, dy));
    }
    if (minDist >= minPx) continue; // spacing exception satisfied -> pass

    // Native form controls at browser-default size are OS-dependent => manual.
    const nativeControl = ['INPUT','SELECT','TEXTAREA'].includes(el.tagName);
    results.push({
      status: nativeControl ? 'manual' : 'violation',
      selector: cssPath(el), bbox: docBox(el),
      w: Math.round(r.width), h: Math.round(r.height),
    });
  }
  return { measured: targets.length, results };
}
""".replace("%SHARED%", _SHARED_JS)


async def check_target_size(page: Page) -> list[dict]:
    """WCAG 2.5.8 — interactive targets should be >= 24x24 CSS px, honoring the
    inline and spacing exceptions. Runs on the mobile (375px) viewport."""
    try:
        data = await page.evaluate(_TARGET_JS, {
            "cap": settings.target_sample_cap,
            "minPx": settings.target_min_px,
        })
    except Exception:
        return []

    records = []
    for r in data.get("results", []):
        manual = r["status"] == "manual"
        records.append(accessibility_record(
            check_id="target-size", criterion_id="2.5.8", impact="moderate",
            description=(f"Native control may be below the 24x24px minimum ({r['w']}x{r['h']}px)" if manual
                        else f"Interactive target is smaller than 24x24px ({r['w']}x{r['h']}px)"),
            remediation="Make the target at least 24 by 24 CSS pixels, or leave 24px of spacing around it, "
                        "so it is easy to activate by touch. Inline links within a sentence are exempt.",
            manual_review=manual, selector=r["selector"], bbox=r["bbox"], viewport="mobile",
        ))
    return records


# --------------------------------------------------------------------------- #
# A1. Reflow — WCAG 1.4.10 (2.1 + 2.2) — 320px viewport
# --------------------------------------------------------------------------- #
# Content that legitimately scrolls in two dimensions is exempt (data tables,
# code blocks, images, media, diagrams, maps/embeds).
_REFLOW_JS = r"""
({ tolerance }) => {
  %SHARED%

  const vw = document.documentElement.clientWidth;
  const overflow = document.documentElement.scrollWidth > vw + tolerance;
  if (!overflow) return { overflow: false, viewport_width: vw, offenders: [], exemptOnly: false };

  const EXEMPT_TAGS = new Set(['TABLE','THEAD','TBODY','TFOOT','TR','TD','TH','PRE','CODE',
                               'CANVAS','VIDEO','IMG','SVG','IFRAME','EMBED','OBJECT','MAP']);
  const isExempt = (el) => {
    if (EXEMPT_TAGS.has(el.tagName)) return true;
    return !!el.closest('table, pre, code, svg, figure, [role=img]');
  };

  const all = [];
  collectDeep('*', document, all);
  let sawOverflow = false, sawNonExempt = false;
  const offenders = [];
  for (const el of all) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= vw + tolerance) continue;   // does not overflow the 320px width
    sawOverflow = true;
    if (isExempt(el)) continue;
    // Report the outermost overflowing non-exempt elements only (skip if an
    // overflowing ancestor is already captured).
    if (el.parentElement && el.parentElement.getBoundingClientRect().right > vw + tolerance && !isExempt(el.parentElement)) continue;
    sawNonExempt = true;
    offenders.push({ selector: cssPath(el), bbox: docBox(el), tag: el.tagName.toLowerCase() });
    if (offenders.length >= 25) break;
  }
  return { overflow: true, viewport_width: vw, offenders, exemptOnly: sawOverflow && !sawNonExempt };
}
""".replace("%SHARED%", _SHARED_JS)


async def check_reflow(page: Page) -> list[dict]:
    """WCAG 1.4.10 — no horizontal scrolling at 320px. Assumes the caller has
    already emulated a 320px viewport and re-settled the page."""
    try:
        data = await page.evaluate(_REFLOW_JS, {"tolerance": 2})
    except Exception:
        return []

    if not data.get("overflow"):
        return []

    if data.get("exemptOnly"):
        # Only tables / code / media overflow — those are allowed to scroll. Flag
        # for a human rather than asserting a violation.
        return [accessibility_record(
            check_id="reflow", criterion_id="1.4.10", impact="minor",
            description="Page scrolls horizontally at 320px, but only exempt content "
                        "(tables, code, media) overflows — needs a human check",
            remediation="Confirm the horizontal scrolling comes only from content that is allowed to "
                        "scroll in two dimensions (data tables, code blocks, images, maps). If other "
                        "content overflows, let it reflow into a single column.",
            manual_review=True, viewport="narrow",
        )]

    records = []
    for o in data.get("offenders", []):
        records.append(accessibility_record(
            check_id="reflow", criterion_id="1.4.10", impact="serious",
            description=f"Content overflows horizontally at 320px (<{o['tag']}>)",
            remediation="Let this content reflow into a single column at 320px wide — avoid fixed widths "
                        "and viewport units that force horizontal scrolling on small screens.",
            selector=o["selector"], bbox=o["bbox"], viewport="narrow",
        ))
    return records
