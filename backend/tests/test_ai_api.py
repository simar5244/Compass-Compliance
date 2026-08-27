import uuid

from app.api.ai import _system_prompt, _snippet_text
from app.models import Issue
from app.ratelimit import UserRateLimiter


def test_ai_system_prompt_contains_real_issue_context():
    issue = Issue(
        rule_id="image-alt",
        impact="serious",
        selector="main > img",
        html_snippet='{"error_text":"<img src=\\"hero.jpg\\">"}',
        category="accessibility",
        subcategory="Images",
        criterion_id="1.1.1",
    )
    prompt = _system_prompt(issue, "https://example.test/about")
    assert "image-alt" in prompt
    assert "https://example.test/about" in prompt
    assert "hero.jpg" in prompt
    assert "main > img" in prompt


def test_ai_snippet_supports_error_text_json():
    assert _snippet_text('{"error_text":"missing alt"}') == "missing alt"
    assert _snippet_text("plain snippet") == "plain snippet"


def test_ai_user_rate_limit_allows_ten_and_blocks_eleventh():
    limiter = UserRateLimiter(max_requests=10, window_seconds=60)
    key = str(uuid.uuid4())
    assert all(limiter.allow(key) for _ in range(10))
    assert not limiter.allow(key)
