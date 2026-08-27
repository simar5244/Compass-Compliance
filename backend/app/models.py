from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Optional

from sqlalchemy import (
    JSON,
    Boolean,
    DateTime,
    Float,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base


def _uuid() -> uuid.UUID:
    return uuid.uuid4()


def _now() -> datetime:
    return datetime.now(timezone.utc)


class Scan(Base):
    """One crawl run. Multiple runs of the same root_url over time are comparable
    by ordering on created_at."""

    __tablename__ = "scans"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    root_url: Mapped[str] = mapped_column(String(2048))
    status: Mapped[str] = mapped_column(String(20), default="pending")
    # pending -> crawling -> scoring -> done | failed
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    # A platform crawl run belongs to a monitored Site; instant scans leave this null.
    site_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("sites.id", ondelete="CASCADE"), nullable=True
    )
    trigger: Mapped[str] = mapped_column(String(20), default="manual")  # manual | scheduled | instant

    # Instant (public single-page) scans get a shareable read-only slug; the
    # public report endpoint only resolves scans with is_instant=True.
    is_instant: Mapped[bool] = mapped_column(Boolean, default=False)
    report_slug: Mapped[Optional[str]] = mapped_column(String(32), unique=True, nullable=True)
    # Optional pre-scan WCAG filter chosen on the landing screen (report default).
    wcag_version: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    wcag_level: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)

    # --- crawl config snapshot ---
    max_pages: Mapped[int] = mapped_column(Integer, default=400)
    max_depth: Mapped[int] = mapped_column(Integer, default=4)
    render_pool_size: Mapped[int] = mapped_column(Integer, default=3)
    ignore_patterns: Mapped[list] = mapped_column(JSON, default=list)
    custom_dictionary: Mapped[list] = mapped_column(JSON, default=list)  # per-site spelling allowlist

    # --- progress ---
    pages_crawled: Mapped[int] = mapped_column(Integer, default=0)
    pages_queued: Mapped[int] = mapped_column(Integer, default=0)
    pages_errored: Mapped[int] = mapped_column(Integer, default=0)

    # --- scores ---
    overall_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    overall_band: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    accessibility_score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    # WCAG family: {"wcag-22-a":.., "wcag-22-aa":.., "wcag-22-aaa":.., "wcag-22":.., ...}
    wcag_scores: Mapped[dict] = mapped_column(JSON, default=dict)
    category_scores: Mapped[dict] = mapped_column(JSON, default=dict)

    # Flexible bag of per-run site-level numeric aggregates used by dashboards
    # (e.g. total_word_count, avg_reading_age).
    metrics: Mapped[dict] = mapped_column(JSON, default=dict)

    # Site-level convenience mirrors of the WCAG 2.2 nested level scores.
    score_a: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_aa: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_aaa: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    started_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    #: Touched as the crawl advances. A worker killed mid-scan leaves the row in
    #: a running state forever, so a stale heartbeat is what lets it be reclaimed.
    last_progress_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    pages: Mapped[list["Page"]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    issues: Mapped[list["Issue"]] = relationship(back_populates="scan", cascade="all, delete-orphan")
    check_scores: Mapped[list["CheckScoreRow"]] = relationship(
        back_populates="scan", cascade="all, delete-orphan"
    )


class Page(Base):
    __tablename__ = "pages"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(2048))
    normalized_url: Mapped[str] = mapped_column(String(2048))
    depth: Mapped[int] = mapped_column(Integer, default=0)

    # --- render outcome ---
    render_status: Mapped[str] = mapped_column(String(20), default="ok")  # ok | error
    status_code: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    final_url: Mapped[Optional[str]] = mapped_column(String(2048), nullable=True)
    # Stored for cross-page duplicate detection on retest.
    title: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    meta_description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    stability_reason: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    cookie_rule: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    render_ms: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    attempts: Mapped[int] = mapped_column(Integer, default=1)
    is_error_page: Mapped[bool] = mapped_column(Boolean, default=False)
    is_document: Mapped[bool] = mapped_column(Boolean, default=False)  # PDF/document, not a rendered page

    # --- scores ---
    score: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_a: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_aa: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    score_aaa: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    issue_count: Mapped[int] = mapped_column(Integer, default=0)
    manual_review_count: Mapped[int] = mapped_column(Integer, default=0)

    # Content metrics for platform dashboards.
    word_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    sentence_count: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    reading_age: Mapped[Optional[float]] = mapped_column(Float, nullable=True)

    # --- artifact refs (relative paths in the artifact store) ---
    desktop_screenshot_ref: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    mobile_screenshot_ref: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)
    narrow_screenshot_ref: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)  # 320px reflow view
    dom_ref: Mapped[Optional[str]] = mapped_column(String(1024), nullable=True)

    # Change detection: hash of normalized main-content text; last_changed_at is
    # the timestamp of the most recent run whose hash differed from the prior run.
    content_hash: Mapped[Optional[str]] = mapped_column(String(64), nullable=True)
    last_changed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    render_unstable: Mapped[bool] = mapped_column(Boolean, default=False)  # hit the stability ceiling
    # Per-viewport capture geometry for pixel-accurate overlays:
    # {desktop|mobile|narrow: {ref, css_width, dpr, page_width_px, page_height_px}}
    screenshots: Mapped[dict] = mapped_column(JSON, default=dict)

    scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    scan: Mapped["Scan"] = relationship(back_populates="pages")
    issues: Mapped[list["Issue"]] = relationship(back_populates="page", cascade="all, delete-orphan")


class Issue(Base):
    """One offending DOM node. `manual_review=True` rows are axe 'incomplete'
    results — reported but excluded from scoring."""

    __tablename__ = "issues"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"))
    page_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("pages.id", ondelete="CASCADE"))

    rule_id: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(20), default="accessibility")
    # accessibility | content | marketing | ux
    subcategory: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    impact: Mapped[Optional[str]] = mapped_column(String(20), nullable=True)
    description: Mapped[str] = mapped_column(Text, default="")
    remediation: Mapped[str] = mapped_column(Text, default="")     # original wording
    reference_url: Mapped[str] = mapped_column(String(2048), default="")

    # WCAG mapping / category tree coordinates
    wcag_version: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)   # 2.0 / 2.1 / 2.2
    wcag_level: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)      # A / AA / AAA
    criterion_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)    # 1.4.3
    criterion_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_best_practice: Mapped[bool] = mapped_column(Boolean, default=False)
    manual_review: Mapped[bool] = mapped_column(Boolean, default=False)
    reviewed: Mapped[bool] = mapped_column(Boolean, default=False)  # user marked a manual-review item done
    is_approved: Mapped[bool] = mapped_column(Boolean, default=False)
    is_ignored: Mapped[bool] = mapped_column(Boolean, default=False)
    wcag_tags: Mapped[list] = mapped_column(JSON, default=list)

    # Overlay data
    selector: Mapped[Optional[str]] = mapped_column(Text, nullable=True)       # shadow-aware path
    leaf_selector: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    html_snippet: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    bbox: Mapped[Optional[dict]] = mapped_column(JSON, nullable=True)          # {x,y,width,height}
    viewport: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)  # desktop / mobile

    scan: Mapped["Scan"] = relationship(back_populates="issues")
    page: Mapped["Page"] = relationship(back_populates="issues")


class CheckScoreRow(Base):
    """Per-scan score for one check (axe rule), aggregated across the crawl."""

    __tablename__ = "check_scores"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"))

    rule_id: Mapped[str] = mapped_column(String(255))
    category: Mapped[str] = mapped_column(String(20), default="accessibility")
    subcategory: Mapped[Optional[str]] = mapped_column(String(40), nullable=True)
    criterion_id: Mapped[Optional[str]] = mapped_column(String(16), nullable=True)
    criterion_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    wcag_version: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    wcag_level: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    is_best_practice: Mapped[bool] = mapped_column(Boolean, default=False)

    pages_affected: Mapped[int] = mapped_column(Integer, default=0)
    avg_issues: Mapped[float] = mapped_column(Float, default=0.0)
    pct_affected: Mapped[float] = mapped_column(Float, default=0.0)
    check_score: Mapped[int] = mapped_column(Integer, default=100)
    penalty: Mapped[float] = mapped_column(Float, default=0.0)

    scan: Mapped["Scan"] = relationship(back_populates="check_scores")


class RetestJob(Base):
    """Tracks a single-URL instant retest through its state machine, with a
    timestamp per state and the final result payload for the UI."""

    __tablename__ = "retest_jobs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"))
    url: Mapped[str] = mapped_column(String(2048))

    state: Mapped[str] = mapped_column(String(20), default="queued")
    # queued -> rendering -> auditing -> finalizing -> done | failed
    error: Mapped[Optional[str]] = mapped_column(Text, nullable=True)

    queued_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), default=_now)
    rendering_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    auditing_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    finalizing_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    done_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Final payload: {page_id, page_score, issues:[...], category_scores, overall_score, overall_band}
    result: Mapped[dict] = mapped_column(JSON, default=dict)


# --------------------------------------------------------------------------- #
# Platform mode: users, sites, assignments, run history / diffs
# --------------------------------------------------------------------------- #

class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(10), default="admin")  # admin | user
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)

    assignments: Mapped[list["SiteAssignment"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    token_hash: Mapped[str] = mapped_column(String(64), unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Site(Base):
    __tablename__ = "sites"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    root_url: Mapped[str] = mapped_column(String(2048), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(255), default="")

    # crawl settings for scheduled/manual runs of this site
    recrawl_interval_days: Mapped[int] = mapped_column(Integer, default=5)
    # One-shot override for the daily scheduler; cleared when a scan is queued.
    force_rescan: Mapped[bool] = mapped_column(Boolean, default=False)
    max_pages: Mapped[int] = mapped_column(Integer, default=400)
    max_depth: Mapped[int] = mapped_column(Integer, default=4)
    ignore_patterns: Mapped[list] = mapped_column(JSON, default=list)
    # Per-site policy keyword rules (B24). Empty = use the built-in defaults.
    policy_rules: Mapped[list] = mapped_column(JSON, default=list)
    included_page_urls: Mapped[list] = mapped_column(JSON, default=list)
    removed_page_urls: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    last_scanned_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    assignments: Mapped[list["SiteAssignment"]] = relationship(
        back_populates="site", cascade="all, delete-orphan"
    )


class SiteAssignment(Base):
    __tablename__ = "site_assignments"
    __table_args__ = (UniqueConstraint("site_id", "user_id", name="uq_site_user"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)

    site: Mapped["Site"] = relationship(back_populates="assignments")
    user: Mapped["User"] = relationship(back_populates="assignments")


class RunDiff(Base):
    """Diff of a crawl run against the previous run of the same site, computed at
    completion. Arbitrary run-to-run comparisons are computed on the fly."""

    __tablename__ = "run_diffs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    scan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("scans.id", ondelete="CASCADE"), index=True)
    prev_scan_id: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("scans.id", ondelete="SET NULL"), nullable=True
    )

    issues_new: Mapped[int] = mapped_column(Integer, default=0)
    issues_resolved: Mapped[int] = mapped_column(Integer, default=0)
    issues_unchanged: Mapped[int] = mapped_column(Integer, default=0)
    # {category: delta} and {"overall": delta}
    score_deltas: Mapped[dict] = mapped_column(JSON, default=dict)
    # per-page: [{url, score_a, score_b, delta, content_changed}]
    per_page: Mapped[list] = mapped_column(JSON, default=list)

    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)


class ApprovedGrammar(Base):
    """Site-wide grammar approvals. Silktide approves the *text*, not an issue id:
    once approved, that exact error text is skipped on every future scan."""

    __tablename__ = "approved_grammar"
    __table_args__ = (UniqueConstraint("site_id", "error_text", name="uq_approved_grammar"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    error_text: Mapped[str] = mapped_column(Text)
    approved_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    approved_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )


class IgnoredGrammarRule(Base):
    """Site-wide suppression of an entire LanguageTool rule across all pages."""

    __tablename__ = "ignored_grammar_rules"
    __table_args__ = (UniqueConstraint("site_id", "rule_id", name="uq_ignored_grammar_rule"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=_uuid)
    site_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("sites.id", ondelete="CASCADE"), index=True)
    rule_id: Mapped[str] = mapped_column(String(255))
    ignored_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=_now)
    ignored_by: Mapped[Optional[uuid.UUID]] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )
