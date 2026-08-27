import uuid
from datetime import datetime

from pydantic import BaseModel, Field, HttpUrl, computed_field

from app.audit.check_catalog import CHECK_CATALOG


_CHECK_DISPLAY_NAMES = {entry.rule_id: entry.display_name for entry in CHECK_CATALOG}
_CHECK_DESCRIPTIONS = {entry.rule_id: entry.description for entry in CHECK_CATALOG}


class CreateScanRequest(BaseModel):
    url: HttpUrl
    max_pages: int | None = Field(default=None, ge=1, le=500)
    max_depth: int | None = Field(default=None, ge=1, le=10)
    ignore_patterns: list[str] | None = None
    custom_dictionary: list[str] | None = None  # per-site spelling allowlist


class ScanSummary(BaseModel):
    id: uuid.UUID
    root_url: str
    status: str
    error: str | None
    max_pages: int
    max_depth: int
    pages_crawled: int
    pages_queued: int
    pages_errored: int

    overall_score: int | None
    overall_band: str | None
    accessibility_score: int | None
    wcag_scores: dict
    category_scores: dict

    score_a: int | None
    score_aa: int | None
    score_aaa: int | None

    created_at: datetime
    started_at: datetime | None
    finished_at: datetime | None

    model_config = {"from_attributes": True}


class PageSummary(BaseModel):
    id: uuid.UUID
    url: str
    depth: int
    # Documents (PDFs, Office files) are listed alongside pages but are counted
    # and presented separately, so callers must be able to tell them apart.
    is_document: bool = False
    render_status: str
    status_code: int | None
    is_error_page: bool
    error: str | None
    score: int | None
    score_a: int | None
    score_aa: int | None
    score_aaa: int | None
    issue_count: int
    manual_review_count: int
    stability_reason: str | None
    cookie_rule: str | None
    render_ms: int | None
    desktop_screenshot_ref: str | None
    mobile_screenshot_ref: str | None

    model_config = {"from_attributes": True}


class IssueOut(BaseModel):
    """A single issue instance with everything the inspector overlay needs."""
    id: uuid.UUID
    rule_id: str
    category: str
    subcategory: str | None
    impact: str | None
    description: str
    remediation: str
    reference_url: str
    wcag_version: str | None
    wcag_level: str | None
    criterion_id: str | None
    criterion_name: str | None
    is_best_practice: bool
    manual_review: bool
    reviewed: bool
    selector: str | None
    html_snippet: str | None
    bbox: dict | None
    viewport: str | None

    @computed_field
    @property
    def display_name(self) -> str:
        """Canonical check name shared with the checks table."""
        return _CHECK_DISPLAY_NAMES.get(
            self.rule_id,
            self.rule_id.replace("-", " ").replace("_", " ").title(),
        )

    @computed_field
    @property
    def check_description(self) -> str:
        """Canonical remediation summary shared with the checks table."""
        return _CHECK_DESCRIPTIONS.get(self.rule_id, self.remediation)

    model_config = {"from_attributes": True}


class PageDetail(BaseModel):
    id: uuid.UUID
    scan_id: uuid.UUID
    url: str
    final_url: str | None
    title: str | None = None
    render_status: str
    is_error_page: bool
    is_document: bool
    score: int | None
    score_a: int | None
    score_aa: int | None
    score_aaa: int | None
    category_scores: dict[str, int | None]
    issue_count: int
    manual_review_count: int
    word_count: int | None = None
    reading_age: float | None = None
    render_ms: int | None = None
    render_time_ms: int | None = None
    status_code: int | None = None
    http_status: int | None = None
    last_scanned_at: datetime | None = None
    issue_count_automated: int = 0
    issue_count_manual: int = 0
    dom_ref: str | None = None
    # {desktop|mobile|narrow: {ref, css_width, dpr, page_width_px, page_height_px}}
    screenshots: dict
    issues: list[IssueOut]


class CheckScoreOut(BaseModel):
    rule_id: str
    category: str
    subcategory: str | None
    criterion_id: str | None
    criterion_name: str | None
    wcag_version: str | None
    wcag_level: str | None
    is_best_practice: bool
    pages_affected: int
    avg_issues: float
    pct_affected: float
    check_score: int
    penalty: float

    model_config = {"from_attributes": True}


class IssueInstance(BaseModel):
    issue_id: uuid.UUID
    page_url: str
    selector: str | None
    html_snippet: str | None
    bbox: dict | None
    viewport: str | None


class IssueGroup(BaseModel):
    rule_id: str
    category: str
    subcategory: str | None
    criterion_id: str | None
    criterion_name: str | None
    wcag_version: str | None
    wcag_level: str | None
    is_best_practice: bool
    manual_review: bool
    impact: str | None
    description: str
    remediation: str
    reference_url: str
    affected_page_count: int
    total_instances: int
    instances: list[IssueInstance]


class InstantScanRequest(BaseModel):
    url: HttpUrl
    # Optional pre-scan WCAG filter, echoed back for the report's default filter.
    wcag_version: str | None = None   # "2.0" | "2.1" | "2.2"
    wcag_level: str | None = None     # "A" | "AA" | "AAA"


class InstantCreateOut(BaseModel):
    scan_id: uuid.UUID
    slug: str


class InstantReport(BaseModel):
    """Public read-only payload for GET /r/{slug}."""
    slug: str
    scan_id: uuid.UUID
    url: str
    status: str
    error: str | None
    overall_score: int | None
    overall_band: str | None
    category_scores: dict
    wcag_scores: dict
    wcag_version: str | None
    wcag_level: str | None
    created_at: datetime
    finished_at: datetime | None
    engine_version: str
    page: "PageDetail | None"


class RetestRequest(BaseModel):
    url: HttpUrl


class RetestJobOut(BaseModel):
    id: uuid.UUID
    scan_id: uuid.UUID
    url: str
    state: str
    error: str | None
    queued_at: datetime | None
    rendering_at: datetime | None
    auditing_at: datetime | None
    finalizing_at: datetime | None
    done_at: datetime | None
    result: dict

    model_config = {"from_attributes": True}


class ReviewRequest(BaseModel):
    reviewed: bool = True


class CategoryNode(BaseModel):
    """A node in the score tree: Accessibility → WCAG version → level → criterion."""
    key: str
    label: str
    score: int | None = None
    children: list["CategoryNode"] = Field(default_factory=list)


class ScanTree(BaseModel):
    scan_id: uuid.UUID
    overall_score: int | None
    overall_band: str | None
    wcag_scores: dict
    categories: list[CategoryNode]


# InstantReport forward-references PageDetail (defined above); resolve it.
InstantReport.model_rebuild()
