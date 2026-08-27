"""The scoring engine: turn per-page audit results into the score tree.

Pure and config-driven (app/config/scoring.yaml). Given the scored issues per
page — accessibility (axe) AND quality (content/marketing/ux) issues in one
list — it computes:
  * a 0-100 score for each check, blending reach and severity,
  * a score for each active category (100 minus its capped check penalties),
  * the WCAG 2.2 family scores (a / aa / aaa, nested) from accessibility checks,
  * the Overall score (mean of active category scores),
  * display bands and a per-page score (with the error-page override).

Accessibility checks are level-weighted (AAA capped); quality checks use weight
1.0. Manual-review issues are never passed in, so they never affect scoring.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field
from decimal import ROUND_HALF_UP, Decimal
from typing import TypedDict

from app.scoring.config import ScoringConfig

_LEVEL_ORDER = ["A", "AA", "AAA"]
ACCESSIBILITY = "accessibility"


@dataclass(frozen=True)
class ScoredIssue:
    rule_id: str                       # check id: axe rule, or a quality check id
    impact: str | None
    category: str = ACCESSIBILITY
    subcategory: str | None = None
    weight: float = 1.0                # per-issue sub-weight
    wcag_level: str | None = None
    wcag_version: str | None = None
    is_best_practice: bool = False
    criterion_id: str | None = None
    criterion_name: str | None = None


@dataclass
class PageAudit:
    key: str
    issues: list[ScoredIssue]
    is_error_page: bool = False


@dataclass
class CheckScore:
    rule_id: str
    category: str
    subcategory: str | None
    criterion_id: str | None
    criterion_name: str | None
    wcag_level: str | None
    wcag_version: str | None
    is_best_practice: bool
    pages_affected: int
    avg_issues: float
    pct_affected: float
    check_score: int
    penalty: float          # (level-)weighted, feeds the category score
    raw_penalty: float      # unweighted, feeds the per-level WCAG breakdown


@dataclass
class SiteScore:
    pages_scored: int
    overall: int
    band: str
    accessibility: int
    category_scores: dict[str, int] = field(default_factory=dict)
    wcag: dict[str, int] = field(default_factory=dict)
    checks: list[CheckScore] = field(default_factory=list)


class PageScoreResult(TypedDict):
    score: int
    score_a: int
    score_aa: int
    score_aaa: int
    category_scores: dict[str, int]


def round_score(x: float) -> int:
    """Clamp to 0-100 and round to nearest int — but never display 100 unless the
    score is genuinely perfect (anything in (99, 100) shows 99)."""
    x = max(0.0, min(100.0, x))
    if x >= 100.0:
        return 100
    if x > 99.0:
        return 99
    return int(Decimal(str(x)).quantize(Decimal("1"), rounding=ROUND_HALF_UP))


def _clamp01(x: float) -> float:
    return max(0.0, min(1.0, x))


def _raw_check_score(pct_affected: float, avg_issues: float, worst_value: float, cfg: ScoringConfig) -> float:
    severity = _clamp01(avg_issues / worst_value) if worst_value > 0 else 0.0
    deficit = cfg.blend_pct * _clamp01(pct_affected) + cfg.blend_severity * severity
    return 100.0 * (1.0 - _clamp01(deficit))


def compute_checks(pages: list[PageAudit], cfg: ScoringConfig) -> list[CheckScore]:
    """Aggregate scored issues into one CheckScore per (category, check) across the crawl."""
    p = len(pages) or 1
    weighted_total: dict[tuple[str, str], float] = defaultdict(float)
    affected_pages: dict[tuple[str, str], set[str]] = defaultdict(set)
    meta: dict[tuple[str, str], ScoredIssue] = {}

    for page in pages:
        for issue in page.issues:
            key = (issue.category, issue.rule_id)
            weighted_total[key] += cfg.impact_weight(issue.impact) * issue.weight
            affected_pages[key].add(page.key)
            meta.setdefault(key, issue)

    checks: list[CheckScore] = []
    for key, wtotal in weighted_total.items():
        category, rule_id = key
        m = meta[key]
        pages_affected = len(affected_pages[key])
        pct = pages_affected / p
        avg = wtotal / p
        score = _raw_check_score(pct, avg, cfg.worst_value(rule_id), cfg)
        deficit_frac = 1.0 - score / 100.0
        raw_pen = deficit_frac * cfg.max_impact(rule_id)
        # Only accessibility checks are level-weighted; quality checks weight 1.0.
        level_w = cfg.level_weight(m.wcag_level, m.is_best_practice) if category == ACCESSIBILITY else 1.0
        checks.append(CheckScore(
            rule_id=rule_id, category=category, subcategory=m.subcategory,
            criterion_id=m.criterion_id, criterion_name=m.criterion_name,
            wcag_level=m.wcag_level, wcag_version=m.wcag_version, is_best_practice=m.is_best_practice,
            pages_affected=pages_affected, avg_issues=round(avg, 3), pct_affected=round(pct, 3),
            check_score=round_score(score), penalty=round(raw_pen * level_w, 3), raw_penalty=round(raw_pen, 3),
        ))
    checks.sort(key=lambda c: c.penalty, reverse=True)
    return checks


def _level_scores(checks: list[CheckScore]) -> dict[str, int]:
    """Nested WCAG level scores from unweighted accessibility penalties (A ⊆ AA ⊆ AAA)."""
    pen_by_level: dict[str, float] = defaultdict(float)
    for c in checks:
        if c.category == ACCESSIBILITY and c.wcag_level in _LEVEL_ORDER:
            pen_by_level[c.wcag_level] += c.raw_penalty
    a = pen_by_level["A"]
    aa = a + pen_by_level["AA"]
    aaa = aa + pen_by_level["AAA"]
    return {
        "wcag-22-a": round_score(100.0 - a),
        "wcag-22-aa": round_score(100.0 - aa),
        "wcag-22-aaa": round_score(100.0 - aaa),
    }


def version_scores(checks: list[CheckScore]) -> dict[str, int]:
    """Overall score per WCAG version (2.1 includes 2.0; 2.2 includes all)."""
    pen: dict[str, float] = defaultdict(float)
    for c in checks:
        if c.category == ACCESSIBILITY and c.wcag_version:
            pen[c.wcag_version] += c.raw_penalty
    v20 = pen["2.0"]
    v21 = v20 + pen["2.1"]
    v22 = v21 + pen["2.2"]
    return {"2.0": round_score(100.0 - v20), "2.1": round_score(100.0 - v21), "2.2": round_score(100.0 - v22)}


def _category_score(checks: list[CheckScore], category: str) -> int:
    total = sum(c.penalty for c in checks if c.category == category)
    return round_score(100.0 - total)


def compute_site_scores(pages: list[PageAudit], cfg: ScoringConfig) -> SiteScore:
    checks = compute_checks(pages, cfg)

    # One score per active category (100 minus its capped, weighted penalties).
    category_scores = {cat: _category_score(checks, cat) for cat in cfg.active_categories()}
    accessibility = category_scores.get(ACCESSIBILITY, _category_score(checks, ACCESSIBILITY))

    wcag = _level_scores(checks)
    wcag["wcag-22"] = accessibility  # headline 2.2 score == the accessibility category

    active = list(category_scores.values())
    overall = round_score(sum(active) / len(active)) if active else accessibility

    return SiteScore(
        pages_scored=len(pages),
        overall=overall,
        band=cfg.band_for(overall),
        accessibility=accessibility,
        category_scores=category_scores,
        wcag=wcag,
        checks=checks,
    )


def compute_page_score(page: PageAudit, cfg: ScoringConfig) -> PageScoreResult:
    """Per-page overall + nested WCAG level sub-scores, with the error override.

    The page 'score' is the mean of its active category scores (mirroring the
    site Overall), so a page weak on content but strong on accessibility reads
    accurately."""
    checks = compute_checks([page], cfg)
    category_scores = {cat: _category_score(checks, cat) for cat in cfg.active_categories()}
    active = list(category_scores.values())
    score = round_score(sum(active) / len(active)) if active else 100
    levels = _level_scores(checks)

    if page.is_error_page:
        cap = cfg.error_page_max_score
        score = min(score, cap)
        levels = {k: min(v, cap) for k, v in levels.items()}

    return {
        "score": score,
        "score_a": levels["wcag-22-a"],
        "score_aa": levels["wcag-22-aa"],
        "score_aaa": levels["wcag-22-aaa"],
        "category_scores": category_scores,
    }
