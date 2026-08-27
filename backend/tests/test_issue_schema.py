import uuid

from app.schemas import IssueOut


def _issue_payload(rule_id: str) -> dict:
    return {
        "id": uuid.uuid4(),
        "rule_id": rule_id,
        "category": "Content",
        "subcategory": None,
        "impact": "moderate",
        "description": "Example finding",
        "remediation": "Fix the example finding.",
        "reference_url": "https://example.com/help",
        "wcag_version": None,
        "wcag_level": None,
        "criterion_id": None,
        "criterion_name": None,
        "is_best_practice": False,
        "manual_review": False,
        "reviewed": False,
        "selector": None,
        "html_snippet": None,
        "bbox": None,
        "viewport": None,
    }


def test_issue_display_name_comes_from_check_catalog() -> None:
    issue = IssueOut.model_validate(_issue_payload("page-title"))

    assert issue.model_dump()["display_name"] == "Check that each page has an appropriate title"
    assert issue.model_dump()["check_description"].startswith("Give every page")


def test_unknown_issue_display_name_has_readable_fallback() -> None:
    issue = IssueOut.model_validate(_issue_payload("new_custom-check"))

    assert issue.display_name == "New Custom Check"
