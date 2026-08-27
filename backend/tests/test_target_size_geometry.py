"""Unit tests for the WCAG 2.5.8 target-size spacing exception geometry."""

from app.audit.geometry import Center, min_center_distance, passes_spacing_exception

MIN_PX = 24.0


def test_isolated_target_passes_spacing_exception():
    # A tiny target with no neighbors within 24px is exempt.
    target = Center(100, 100)
    others = [Center(200, 200), Center(400, 100)]
    assert passes_spacing_exception(target, others, MIN_PX) is True


def test_crowded_targets_fail_spacing_exception():
    # Two 16px buttons 16px apart => centers ~16px apart => intersect => fail.
    target = Center(0, 0)
    others = [Center(16, 0)]
    assert passes_spacing_exception(target, others, MIN_PX) is False


def test_exactly_min_px_apart_passes():
    # Boundary: centers exactly 24px apart => circles just touch, not intersect.
    target = Center(0, 0)
    others = [Center(MIN_PX, 0)]
    assert passes_spacing_exception(target, others, MIN_PX) is True


def test_just_under_min_px_fails():
    target = Center(0, 0)
    others = [Center(MIN_PX - 0.5, 0)]
    assert passes_spacing_exception(target, others, MIN_PX) is False


def test_no_other_targets_is_isolated():
    assert passes_spacing_exception(Center(5, 5), [], MIN_PX) is True


def test_min_center_distance_picks_nearest():
    target = Center(0, 0)
    others = [Center(50, 0), Center(10, 0), Center(30, 0)]
    assert min_center_distance(target, others) == 10.0


def test_diagonal_distance():
    # 3-4-5 triangle: centers (0,0) and (18,24) are 30px apart => isolated at 24.
    assert passes_spacing_exception(Center(0, 0), [Center(18, 24)], MIN_PX) is True
    # (0,0) and (12,16) are 20px apart => not isolated.
    assert passes_spacing_exception(Center(0, 0), [Center(12, 16)], MIN_PX) is False
