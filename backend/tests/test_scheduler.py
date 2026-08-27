from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.scheduler import is_site_due


def _site(**overrides):
    values = {
        "force_rescan": False,
        "last_scanned_at": datetime(2026, 1, 1, tzinfo=timezone.utc),
        "recrawl_interval_days": 5,
    }
    values.update(overrides)
    return SimpleNamespace(**values)


def test_site_is_due_after_configured_interval():
    site = _site(last_scanned_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert is_site_due(site, datetime(2026, 1, 6, tzinfo=timezone.utc))


def test_site_is_not_due_before_configured_interval():
    site = _site(last_scanned_at=datetime(2026, 1, 1, tzinfo=timezone.utc))
    assert not is_site_due(site, datetime(2026, 1, 5, 23, 59, tzinfo=timezone.utc))


def test_site_without_scan_is_due():
    assert is_site_due(_site(last_scanned_at=None), datetime.now(timezone.utc))


def test_force_rescan_is_due_even_when_recent():
    site = _site(
        force_rescan=True,
        last_scanned_at=datetime.now(timezone.utc) - timedelta(minutes=1),
    )
    assert is_site_due(site, datetime.now(timezone.utc))


def test_zero_interval_is_clamped_to_one_day():
    site = _site(recrawl_interval_days=0)
    assert not is_site_due(site, site.last_scanned_at)
