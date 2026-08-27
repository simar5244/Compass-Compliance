"""Shared construction of the Inspector's page-scoped response."""

import json

from app.models import Issue, Page
from app.schemas import IssueOut, PageDetail
from app.scoring.config import load_scoring_config
from app.scoring.engine import PageAudit, ScoredIssue, compute_page_score


def _scored_issue(issue: Issue) -> ScoredIssue:
    return ScoredIssue(
        rule_id=issue.rule_id,
        impact=issue.impact,
        category=issue.category,
        subcategory=issue.subcategory,
        wcag_level=issue.wcag_level,
        wcag_version=issue.wcag_version,
        is_best_practice=issue.is_best_practice,
        criterion_id=issue.criterion_id,
        criterion_name=issue.criterion_name,
    )


def page_category_scores(page: Page, issues: list[Issue]) -> dict[str, int | None]:
    """Score this page alone, returning API-facing category display names."""
    cfg = load_scoring_config()
    scored_issues = [
        _scored_issue(issue)
        for issue in issues
        if not issue.manual_review and not issue.is_ignored
    ]
    result = compute_page_score(
        PageAudit(key=page.url, issues=scored_issues, is_error_page=page.is_error_page),
        cfg,
    )
    internal_scores = result["category_scores"]
    return {
        category.label: internal_scores.get(key) if category.active else None
        for key, category in cfg.categories.items()
    }


def page_detail_from_rows(page: Page, issues: list[Issue]) -> PageDetail:
    def issue_order(issue: Issue) -> tuple[int, str]:
        if issue.rule_id == "sensitive_keywords" and issue.html_snippet:
            try:
                occurrence = int(json.loads(issue.html_snippet).get("occurrence", 9999))
                return occurrence, str(issue.id)
            except (TypeError, ValueError, json.JSONDecodeError):
                pass
        return 9999, str(issue.id)

    ordered_issues = sorted(issues, key=issue_order)
    return PageDetail(
        id=page.id,
        scan_id=page.scan_id,
        url=page.url,
        final_url=page.final_url,
        title=page.title,
        render_status=page.render_status,
        is_error_page=page.is_error_page,
        is_document=page.is_document,
        score=page.score,
        score_a=page.score_a,
        score_aa=page.score_aa,
        score_aaa=page.score_aaa,
        category_scores=page_category_scores(page, issues),
        issue_count=page.issue_count,
        manual_review_count=page.manual_review_count,
        word_count=page.word_count,
        reading_age=page.reading_age,
        render_ms=page.render_ms,
        render_time_ms=page.render_ms,
        status_code=page.status_code,
        http_status=page.status_code,
        last_scanned_at=page.scanned_at,
        issue_count_automated=page.issue_count,
        issue_count_manual=page.manual_review_count,
        dom_ref=page.dom_ref,
        screenshots=page.screenshots or {},
        issues=[IssueOut.model_validate(issue) for issue in ordered_issues],
    )
