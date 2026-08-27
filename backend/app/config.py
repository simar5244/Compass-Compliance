from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    database_url: str = "postgresql+asyncpg://wcag:wcag@localhost:55433/wcag_scanner"
    redis_url: str = "redis://localhost:6380/0"
    cors_origins: str = "http://localhost:3000"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o"

    # Crawl budget / behavior
    crawl_max_pages_default: int = 400
    crawl_max_depth_default: int = 4
    # Documents have their own budget: a page-heavy site would otherwise
    # exhaust the crawl before its documents are discovered.
    crawl_max_documents_default: int = 300
    # Unique links are requested once each; this bounds that fan-out.
    link_check_concurrency: int = 10
    respect_robots: bool = True

    # Lighthouse performance checks (Group C). OFF by default — a Lighthouse run
    # adds ~10-15s per page. When false, the perf checks exist but produce empty
    # results; enable per-site/globally to populate them.
    enable_lighthouse: bool = False
    # The vitals screen measures the site's front door twice per scan, which is
    # cheap; the per-page performance checks above are not, and stay off.
    enable_web_vitals: bool = True
    lighthouse_max_concurrent: int = 2
    lighthouse_timeout_s: int = 60

    # Render worker pool: how many pages render concurrently (Chromium contexts).
    # Each consumes the shared frontier.
    render_pool_size: int = 3
    # Politeness: minimum gap between navigations to the same domain.
    politeness_delay_ms: int = 1000

    # Per-page render tuning (see app/render).
    goto_timeout_ms: int = 30_000
    stability_quiet_ms: int = 750
    stability_ceiling_ms: int = 25_000
    capture_mobile: bool = True
    # Total wall-clock ceiling for one page across all viewport passes
    # (desktop audit + mobile target-size + 320px reflow).
    page_time_ceiling_ms: int = 40_000

    # --- Phase 3 custom layout checks (all thresholds configurable) ---
    reflow_viewport_width: int = 320          # WCAG 1.4.10 test width
    reflow_settle_quiet_ms: int = 500         # re-settle after viewport resize
    focus_sample_cap: int = 150               # max focusable elements sampled per page
    focus_luminance_delta: float = 0.10       # min luminance change to count as a visible focus cue
    focus_contrast_min_ratio: float = 1.30    # OR min color-contrast ratio change to count
    target_min_px: float = 24.0               # WCAG 2.5.8 minimum target size (CSS px)
    target_sample_cap: int = 400              # max interactive targets measured per page

    # Public instant-scan create path: per-IP rate limit.
    instant_rate_max: int = 10
    instant_rate_window_seconds: int = 600  # 10 minutes

    # Where screenshots + serialized DOM are written.
    artifact_dir: str = "./artifacts"

    @property
    def cors_origin_list(self) -> list[str]:
        return [o.strip() for o in self.cors_origins.split(",") if o.strip()]


settings = Settings()
