"""The User Experience module's check list, in the exact order it is presented.

Most of these are Lighthouse audits and therefore only produce findings when
``enable_lighthouse`` is on; the API marks the rest blocked rather than passing.
The four that run regardless are reflow, missing images, JavaScript errors and
server response time.
"""

from __future__ import annotations

from app.audit.content_check_set import ContentCheck as ModuleCheck

UXCheck = ModuleCheck

UX_CHECKS: tuple[UXCheck, ...] = (
    UXCheck("reflow", "Ensure pages don't scroll in two dimensions on small screens", ("2.1", "AA", "1.4.10"), "Mobile"),
    UXCheck("defer_offscreen_images", "Defer offscreen images", None, "Web Vitals"),
    UXCheck("missing_images", "Fix missing images", None, "Functionality"),
    UXCheck("render_blocking_resources", "Eliminate render-blocking resources", None, "Web Vitals"),
    UXCheck("unused_javascript", "Remove unused JavaScript", None, "Web Vitals"),
    UXCheck("image_modern_format", "Serve images in modern formats", None, "Web Vitals"),
    UXCheck("image_resolution", "Serve images in an appropriate resolution", None, "Web Vitals"),
    UXCheck("high_rtt", "Reduce Round Trip Times", None, "Web Vitals"),
    UXCheck("unused_css", "Remove unused CSS", None, "Web Vitals"),
    UXCheck("missing_js_files", "Fix missing JavaScript files", None, "Functionality"),
    UXCheck("js_execution_time", "Reduce JavaScript execution time", None, "Web Vitals"),
    UXCheck("missing_css_files", "Fix missing CSS files", None, "Functionality"),
    UXCheck("excessive_dom_size", "Avoid excessive DOM size", None, "Web Vitals"),
    UXCheck("legacy_javascript", "Avoid serving legacy JavaScript to modern browsers", None, "Web Vitals"),
    UXCheck("javascript_errors", "Fix JavaScript errors", None, "Functionality"),
    UXCheck("third_party_impact", "Reduce the impact of third-party code", None, "Web Vitals"),
    UXCheck("cache_ttl", "Cache static assets efficiently", None, "Web Vitals"),
    UXCheck("font_display", "Ensure text remains visible during webfont load", None, "Web Vitals"),
    UXCheck("unminified_css", "Minify CSS", None, "Web Vitals"),
    UXCheck("preconnect_missing", "Preconnect to required origins", None, "Web Vitals"),
    UXCheck("image_optimization", "Consider optimizing images", None, "Functionality"),
    UXCheck("unminified_javascript", "Minify JavaScript", None, "Web Vitals"),
    UXCheck("time_to_interactive", "Ensure pages appear to load quickly", None, "Web Vitals"),
    UXCheck("passive_event_listeners", "Use passive event listeners", None, "Web Vitals"),
    UXCheck("server_response_time", "Keep server response times short", None, "Web Vitals"),
    UXCheck("favicon_review", "Review unapproved Favicons", None, "Functionality"),
    UXCheck("javascript_logs", "Review JavaScript log messages", None, "Functionality"),
)

UX_CHECK_ORDER: tuple[str, ...] = tuple(c.rule_id for c in UX_CHECKS)
UX_CHECK_BY_ID: dict[str, UXCheck] = {c.rule_id: c for c in UX_CHECKS}


def ux_rank(rule_id: str) -> int:
    """Position in the presented order; unlisted ids sort last."""
    try:
        return UX_CHECK_ORDER.index(rule_id)
    except ValueError:
        return len(UX_CHECK_ORDER)
