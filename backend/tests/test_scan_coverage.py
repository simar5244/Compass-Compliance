"""A finished scan must not report success when it audited nothing.

Every score is computed over the pages that succeeded, so a scan that lost all
of its pages scores as a clean site. These pin the status decision.
"""

from app.scan_engine import _coverage_verdict


def test_normal_finish_is_done():
    assert _coverage_verdict(audited=150, errored=0) == ("done", None)


def test_partial_coverage_still_finishes_as_done():
    # Losing some pages is normal and must not fail the scan — the coverage
    # numbers are recorded separately so a consumer can see what was missed.
    status, error = _coverage_verdict(audited=149, errored=1)
    assert (status, error) == ("done", None)


def test_all_pages_failed_is_not_done():
    status, error = _coverage_verdict(audited=0, errored=3)
    assert status == "failed"
    assert "no score" in error


def test_nothing_crawled_is_not_done():
    # The seed page timing out leaves the crawl with nothing to expand from.
    status, error = _coverage_verdict(audited=0, errored=0)
    assert status == "failed"
    assert "no score" in error
