"""Run our vendored axe-core against a live Playwright page.

We inject `app/vendor/axe.min.js` (axe-core 4.x, pinned in the repo) rather than
relying on a third-party wrapper, so the ruleset is reproducible and upgraded on
our schedule. axe traverses open shadow DOM natively, so LWC/web-component
content is audited as long as it rendered (which our render worker ensures).

`axe.run` returns four buckets:
  * violations  — failed checks (scored)
  * passes      — passed checks
  * incomplete  — needs a human decision => surfaced as MANUAL REVIEW, not scored
  * inapplicable— rule had nothing to test
We run with all rule tags enabled so WCAG 2.0/2.1/2.2 A/AA/AAA and best-practice
rules all fire; bucketing by tag happens in `app.audit.wcag`.
"""

from __future__ import annotations

from functools import lru_cache
from pathlib import Path

from playwright.async_api import Page

_AXE_PATH = Path(__file__).resolve().parent.parent / "vendor" / "axe.min.js"


@lru_cache(maxsize=1)
def _axe_source() -> str:
    return _AXE_PATH.read_text(encoding="utf-8")


# Run axe over the whole document with every rule tag active. `resultTypes` keeps
# node data on all four buckets so we can report passes/incomplete too.
_RUN_AXE_JS = r"""
async () => {
  const opts = {
    runOnly: {
      type: 'tag',
      values: ['wcag2a','wcag2aa','wcag2aaa','wcag21a','wcag21aa','wcag21aaa',
               'wcag22a','wcag22aa','wcag22aaa','best-practice'],
    },
    // We implement WCAG 2.5.8 (target-size) ourselves with the spacing/inline
    // exceptions on the mobile viewport, so disable axe's rule to avoid
    // double-counting the same offending elements under the same check id.
    rules: { 'target-size': { enabled: false } },
    resultTypes: ['violations', 'incomplete', 'passes'],
  };
  const results = await window.axe.run(document, opts);
  return {
    violations: results.violations,
    incomplete: results.incomplete,
    passes: results.passes,
    inapplicable: results.inapplicable ? results.inapplicable.map((r) => r.id) : [],
    testEngine: results.testEngine,
  };
}
"""


async def run_axe(page: Page) -> dict:
    """Inject axe-core into ``page`` and return its raw result buckets."""
    # add_script_tag re-injects per page; axe is idempotent to re-inject.
    if not await page.evaluate("() => !!window.axe"):
        await page.add_script_tag(content=_axe_source())
    return await page.evaluate(_RUN_AXE_JS)
