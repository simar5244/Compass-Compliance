"""Unit tests for the run-diff layer: fingerprint stability, diff math, score
deltas, and content-change hashing."""

from app.diffing import (
    content_hash_text,
    diff_fingerprint_sets,
    issue_fingerprint,
    score_deltas,
)


def test_same_issue_same_fingerprint():
    a = issue_fingerprint("color-contrast", "https://x.com/p", "main > p", "<p>hi</p>")
    b = issue_fingerprint("color-contrast", "https://x.com/p", "main > p", "<p>hi</p>")
    assert a == b


def test_url_normalization_stabilizes_fingerprint():
    # trailing slash + tracking param must not change identity
    a = issue_fingerprint("image-alt", "https://x.com/p", "img", "<img>")
    b = issue_fingerprint("image-alt", "https://x.com/p/?utm_source=x", "img", "<img>")
    assert a == b


def test_snippet_case_and_outer_whitespace_insensitive():
    # Case + leading/trailing whitespace must not change identity.
    a = issue_fingerprint("link-name", "https://x.com/p", "a", "  <A>Click</A>  ")
    b = issue_fingerprint("link-name", "https://x.com/p", "a", "<a>click</a>")
    assert a == b


def test_moved_selector_is_a_different_issue():
    # A defect that moves to a different selector reads as resolved + new.
    a = issue_fingerprint("color-contrast", "https://x.com/p", "main > p:nth-of-type(1)", "<p>hi</p>")
    b = issue_fingerprint("color-contrast", "https://x.com/p", "main > p:nth-of-type(2)", "<p>hi</p>")
    assert a != b


def test_different_check_is_a_different_issue():
    a = issue_fingerprint("color-contrast", "https://x.com/p", "p", "<p>hi</p>")
    b = issue_fingerprint("image-alt", "https://x.com/p", "p", "<p>hi</p>")
    assert a != b


def test_diff_counts_new_resolved_unchanged():
    prev = {"a", "b", "c"}
    new = {"b", "c", "d", "e"}
    d = diff_fingerprint_sets(new, prev)
    assert d.new == 2       # d, e
    assert d.resolved == 1  # a
    assert d.unchanged == 2 # b, c


def test_moved_selector_shows_as_resolved_plus_new():
    old = issue_fingerprint("color-contrast", "https://x.com/p", "p:nth-of-type(1)", "<p>hi</p>")
    moved = issue_fingerprint("color-contrast", "https://x.com/p", "p:nth-of-type(2)", "<p>hi</p>")
    d = diff_fingerprint_sets({moved}, {old})
    assert d.new == 1 and d.resolved == 1 and d.unchanged == 0


def test_score_deltas():
    d = score_deltas({"accessibility": 80, "content": 90, "overall": 85},
                     {"accessibility": 75, "content": 90, "overall": 82})
    assert d == {"accessibility": 5, "content": 0, "overall": 3}


def test_score_deltas_skip_missing():
    d = score_deltas({"accessibility": 80}, {"content": 70})
    assert d == {}  # neither key present in both


def test_compare_positive_run_delta():
    assert score_deltas({"overall": 92}, {"overall": 84}) == {"overall": 8}


def test_compare_negative_run_delta():
    assert score_deltas({"overall": 71}, {"overall": 86}) == {"overall": -15}


def test_content_hash_detects_change():
    h1 = content_hash_text("The quick brown fox.")
    h2 = content_hash_text("The quick brown fox.")
    h3 = content_hash_text("The quick brown cat.")
    assert h1 == h2
    assert h1 != h3


def test_content_hash_ignores_whitespace_and_case():
    assert content_hash_text("Hello   World") == content_hash_text("hello world")


def test_assisted_issue_fingerprint_is_stable_for_history():
    # Manual-review status is intentionally outside the fingerprint. The same
    # finding must remain unchanged even though it does not affect scoring.
    assert issue_fingerprint(
        "page_missing_from_sitemap", "https://x.com/p/", None,
        '{"page_url": "https://x.com/p/"}',
    ) == issue_fingerprint(
        "page_missing_from_sitemap", "https://x.com/p", None,
        '{"page_url": "https://x.com/p/"}',
    )
