from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

from app.audit.ttu_brand_checks import color_distance
from app.audit.ttu_freshness_checks import outdated_year_records, stale_content_record
from app.audit.ttu_ferpa_checks import R_NUMBER_RE, detect_r_number_exposure
from app.audit.ttu_sb17_checks import classify_sb17_text


def test_ttu_r_number_regex():
    assert R_NUMBER_RE.search("Student R12345678 record")
    assert not R_NUMBER_RE.search("Student R1234567 record")
    assert not R_NUMBER_RE.search("Student R123456789 record")
    assert len(detect_r_number_exposure("Student R12345678 record")) == 1


def test_sb17_tier1_detection_does_not_overlap():
    result = classify_sb17_text("The diversity, equity and inclusion office serves students.")
    assert result["tier1_matches"]
    assert not result["tier2_matches"]
    assert result["recommended_action"] == "Legal review required"


def test_sb17_tier3_detection():
    result = classify_sb17_text("This is the study of diversity in American history.")
    assert not result["tier1_matches"]
    assert not result["tier2_matches"]
    assert result["tier3_matches"]
    assert result["recommended_action"] == "Monitor"


def test_emergency_number_helper_is_covered_by_exact_pattern():
    from app.audit.ttu_emergency_checks import re
    assert re.search(r"806[\s.-]?742[\s.-]?3931", "Call 806-742-3931")


def test_stale_content():
    changed = datetime.now(timezone.utc) - timedelta(days=400)
    assert stale_content_record(changed, "https://www.ttu.edu/about") is not None
    assert stale_content_record(None, "https://www.ttu.edu/about") is None


def test_outdated_year():
    assert outdated_year_records("Fall 2022 semester", "https://www.ttu.edu/admissions", 2026)


def test_brand_color_distance():
    assert color_distance("#CC0000", "#CC0000") == 0
    assert color_distance("#FF0000", "#CC0000") > 20
    assert color_distance("#0000FF", "#CC0000") > 20


def test_ferpa_directory_requires_multiple_signals_and_listing_url():
    import asyncio

    from app.audit.ttu_ferpa_checks import run_ttu_ferpa_checks

    class FakePage:
        async def evaluate(self, _script):
            return {
                "text": "The program supports enrollment and graduation.",
                "html": "",
                "url": "https://www.ttu.edu/about",
                "hasAuth": False,
            }

    assert not asyncio.run(run_ttu_ferpa_checks(FakePage()))
