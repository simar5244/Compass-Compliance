"""Pure-Python reference implementations of the two numeric decisions in the
custom layout checks: the target-size spacing exception (WCAG 2.5.8) and the
focus-visible luminance/contrast threshold (WCAG 2.4.7).

The live checks run this same logic in the browser (app/audit/layout_checks.py);
these functions mirror it exactly so the thresholds can be unit-tested without a
browser and serve as the authoritative spec for the numbers. Keep the two in
sync — the JS and this module must agree.
"""

from __future__ import annotations

import math
from dataclasses import dataclass


@dataclass(frozen=True)
class Center:
    cx: float
    cy: float


def min_center_distance(target: Center, others: list[Center]) -> float:
    """Smallest distance from ``target`` to any other target center (inf if none)."""
    best = math.inf
    for o in others:
        best = min(best, math.hypot(target.cx - o.cx, target.cy - o.cy))
    return best


def passes_spacing_exception(target: Center, others: list[Center], min_px: float) -> bool:
    """WCAG 2.5.8 spacing exception.

    An undersized target passes if a ``min_px``-diameter circle centered on it
    does not intersect the equivalent circle of any other target. Two circles of
    diameter ``min_px`` (radius min_px/2) intersect when the distance between
    centers is < min_px, so the exception holds when the nearest neighbor is at
    least ``min_px`` away.
    """
    return min_center_distance(target, others) >= min_px


def relative_luminance(rgb: tuple[float, float, float]) -> float:
    """WCAG relative luminance of an sRGB color (channels 0-255)."""
    def lin(c: float) -> float:
        c /= 255.0
        return c / 12.92 if c <= 0.03928 else ((c + 0.055) / 1.055) ** 2.4
    r, g, b = rgb
    return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b)


def contrast_ratio(a: tuple[float, float, float], b: tuple[float, float, float]) -> float:
    """WCAG contrast ratio between two colors (1.0 – 21.0)."""
    la, lb = relative_luminance(a), relative_luminance(b)
    hi, lo = max(la, lb), min(la, lb)
    return (hi + 0.05) / (lo + 0.05)


@dataclass(frozen=True)
class FocusStyle:
    outline_width: float = 0.0
    outline_style: str = "none"
    box_shadow: str = "none"
    bg: tuple[float, float, float] = (255, 255, 255)
    text_decoration: str = "none"


def focus_change_is_meaningful(
    before: FocusStyle,
    after: FocusStyle,
    *,
    luminance_delta: float,
    contrast_min_ratio: float,
) -> bool:
    """True when the on-focus style change is a visible focus indicator.

    Strong cues always count: an outline or box-shadow appearing. Weaker cues
    (background color / text-decoration change) count only if they clear a
    threshold, so a 1-unit color nudge doesn't pass as a "focus indicator".
    """
    outline_appeared = (
        after.outline_width > 0 and after.outline_style != "none"
        and not (before.outline_width > 0 and before.outline_style != "none")
    )
    box_shadow_appeared = after.box_shadow != "none" and after.box_shadow != before.box_shadow
    if outline_appeared or box_shadow_appeared:
        return True

    if after.text_decoration != before.text_decoration:
        return True

    lum_change = abs(relative_luminance(after.bg) - relative_luminance(before.bg))
    bg_contrast = contrast_ratio(before.bg, after.bg)
    return lum_change >= luminance_delta or bg_contrast >= contrast_min_ratio
