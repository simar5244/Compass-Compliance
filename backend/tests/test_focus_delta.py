"""Unit tests for the WCAG 2.4.7 focus-visible meaningfulness threshold."""

from app.audit.geometry import (
    FocusStyle,
    contrast_ratio,
    focus_change_is_meaningful,
    relative_luminance,
)

LUM_DELTA = 0.10
CONTRAST_MIN = 1.30


def meaningful(before, after):
    return focus_change_is_meaningful(before, after, luminance_delta=LUM_DELTA, contrast_min_ratio=CONTRAST_MIN)


def test_outline_appearing_counts():
    before = FocusStyle(outline_width=0, outline_style="none")
    after = FocusStyle(outline_width=2, outline_style="solid")
    assert meaningful(before, after) is True


def test_no_change_is_not_meaningful():
    style = FocusStyle(outline_width=0, outline_style="none", bg=(255, 255, 255))
    assert meaningful(style, style) is False


def test_box_shadow_appearing_counts():
    before = FocusStyle(box_shadow="none")
    after = FocusStyle(box_shadow="rgb(0,0,255) 0px 0px 0px 2px")
    assert meaningful(before, after) is True


def test_tiny_background_nudge_below_threshold_fails():
    # White -> almost-white: luminance change < 0.10 and contrast < 1.30.
    before = FocusStyle(bg=(255, 255, 255))
    after = FocusStyle(bg=(252, 252, 252))
    assert meaningful(before, after) is False


def test_strong_background_change_passes():
    # White -> mid-grey: large luminance change.
    before = FocusStyle(bg=(255, 255, 255))
    after = FocusStyle(bg=(120, 120, 120))
    assert meaningful(before, after) is True


def test_text_decoration_change_counts():
    before = FocusStyle(text_decoration="none")
    after = FocusStyle(text_decoration="underline")
    assert meaningful(before, after) is True


def test_luminance_and_contrast_math():
    assert relative_luminance((255, 255, 255)) == 1.0 or abs(relative_luminance((255, 255, 255)) - 1.0) < 1e-9
    assert relative_luminance((0, 0, 0)) == 0.0
    # Black on white is the maximum 21:1 contrast.
    assert abs(contrast_ratio((0, 0, 0), (255, 255, 255)) - 21.0) < 0.01


def test_outline_already_present_does_not_count_as_appearing():
    # If an outline exists before AND after focus, it didn't "appear" on focus.
    before = FocusStyle(outline_width=2, outline_style="solid", bg=(255, 255, 255))
    after = FocusStyle(outline_width=2, outline_style="solid", bg=(255, 255, 255))
    assert meaningful(before, after) is False
