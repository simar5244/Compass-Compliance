/**
 * Pure helpers for the instant report — kept free of React so they can be
 * unit-tested directly: severity→icon mapping, the sidebar search filter, and
 * the config-sourced threshold text for check detail views.
 */

import type { IssueOut } from "@/lib/api";

export type SeverityKind = "error" | "warning" | "info";

export interface SeverityIcon {
  kind: SeverityKind;
  color: string;
  /** shape hint the UI renders: solid circle / triangle / circled-i */
  shape: "circle" | "triangle" | "info";
}

/** Map an axe/engine impact to our own iconography (original colors + shapes). */
export function severityIcon(impact: string | null | undefined): SeverityIcon {
  switch (impact) {
    case "critical":
    case "serious":
      return { kind: "error", color: "#dc2626", shape: "circle" };
    case "moderate":
      return { kind: "warning", color: "#d97706", shape: "triangle" };
    default:
      return { kind: "info", color: "#6b7280", shape: "info" };
  }
}

/** Rank for sorting checks/issues most-severe first. */
export function severityRank(impact: string | null | undefined): number {
  switch (impact) {
    case "critical": return 0;
    case "serious": return 1;
    case "moderate": return 2;
    case "minor": return 3;
    default: return 4;
  }
}

/** Live filter: keep issues whose check/criterion text matches the query. */
export function filterBySearch(issues: IssueOut[], query: string): IssueOut[] {
  const q = query.trim().toLowerCase();
  if (!q) return issues;
  return issues.filter((i) => {
    const hay = [i.rule_id, i.description, i.criterion_name, i.subcategory, i.category]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
}

export interface CheckConfig {
  thresholds: {
    target_min_px: number;
    reflow_viewport_width: number;
    focus_luminance_delta: number;
    focus_contrast_min_ratio: number;
    contrast_aa_normal: number;
    contrast_aa_large: number;
  };
  checks: Record<string, { category: string; subcategory: string | null; worst_value: number; max_impact: number }>;
  check_overrides: Record<string, { worst_value?: number; max_impact?: number }>;
}

/**
 * The exact threshold sentence shown in a check's detail view, built from the
 * engine config so it can never drift from what the scanner actually enforces.
 * Returns null when a check has no numeric threshold to surface.
 */
export function thresholdText(ruleId: string, cfg: CheckConfig | null): string | null {
  if (!cfg) return null;
  const t = cfg.thresholds;
  switch (ruleId) {
    case "target-size":
      return `Interactive targets must be at least ${t.target_min_px}×${t.target_min_px} CSS pixels, unless spaced ${t.target_min_px}px apart or inline in text.`;
    case "reflow":
      return `Content must not require horizontal scrolling at ${t.reflow_viewport_width} CSS pixels wide.`;
    case "focus-visible":
      return `On focus, an element must show a visible indicator — an outline/box-shadow, or a color change of at least ${t.focus_contrast_min_ratio}:1 contrast (or ${t.focus_luminance_delta} luminance).`;
    case "color-contrast":
      return `Text must meet a contrast ratio of at least ${t.contrast_aa_normal}:1 (normal) or ${t.contrast_aa_large}:1 (large).`;
    default:
      return null;
  }
}
export const CONTENT_CHECKS = [
  { ruleId: "broken-links", title: "Check and fix broken links", impact: "serious" },
  { ruleId: "spelling", title: "Check and fix misspellings", impact: "moderate" },
  { ruleId: "sensitive_keywords", title: "Sensitive keywords", impact: "moderate" },
  { ruleId: "link_purpose_unclear", title: "Ensure links explain their purpose", impact: "moderate" },
  { ruleId: "image_optimization", title: "Consider optimizing images", impact: "minor" },
  { ruleId: "new_tab_disclosure", title: "Ensure links explain they open in a new tab", impact: "minor" },
  { ruleId: "pdf_not_tagged", title: "Tag all PDFs", impact: "serious" },
  { ruleId: "thin_pages", title: "Minimize \"thin\" pages", impact: "minor" },
  { ruleId: "grammar", title: "Review potential grammar errors", impact: "minor" },
  { ruleId: "page-has-heading-one", title: "Ensure every page contains a top-level heading", impact: "moderate" },
  { ruleId: "pdf_no_title", title: "Ensure PDFs have a title", impact: "moderate" },
  { ruleId: "title_too_long", title: "Ensure page titles are not longer than 60 characters", impact: "minor" },
  { ruleId: "reading_level_aaa", title: "Ensure content is not too difficult to understand", impact: "minor" },
  { ruleId: "meta_description", title: "Specify meta descriptions for relevant pages", impact: "minor" },
  { ruleId: "image-redundant-alt", title: "Avoid alternative text that is the same as adjacent text", impact: "minor" },
  { ruleId: "readability", title: "Consider making text easier to understand", impact: "minor" },
  { ruleId: "meta_description_too_short", title: "Ensure meta descriptions are at least 60 characters long", impact: "minor" },
  { ruleId: "empty-heading", title: "Ensure headings include text", impact: "moderate" },
  { ruleId: "pdf_no_headings", title: "Specify headings for every PDF", impact: "moderate" },
  { ruleId: "pdf_no_language", title: "Ensure PDFs specify a default language", impact: "moderate" },
  { ruleId: "identical-links-same-purpose", title: "Avoid using the same link text for different destinations", impact: "moderate" },
  { ruleId: "texas_senate_bill_17", title: "Texas Senate Bill 17", impact: "moderate" },
  { ruleId: "find_accessibility", title: "Find \"accessibility\"", impact: "minor" },
  { ruleId: "pdf_heading_order", title: "Ensure PDF headings follow a logical order", impact: "moderate" },
  { ruleId: "eeo_terms", title: "Identify Pages using EEO terms", impact: "minor" },
  { ruleId: "affirmative_action", title: "Identify Pages using Affirmative Action terms", impact: "minor" },
  { ruleId: "multiple_h1", title: "Avoid more than one H1 header per page", impact: "minor" },
  { ruleId: "link_no_text", title: "Ensure links contain text", impact: "serious" },
  { ruleId: "pdf_no_bookmarks", title: "Ensure long PDFs use bookmarks to aid navigation", impact: "minor" },
] as const;

export const CONTENT_CHECK_ORDER = CONTENT_CHECKS.map((check) => check.ruleId);

export function contentCheckRank(ruleId: string): number {
  const rank = CONTENT_CHECK_ORDER.indexOf(ruleId as (typeof CONTENT_CHECK_ORDER)[number]);
  return rank === -1 ? CONTENT_CHECK_ORDER.length : rank;
}

export function contentCheckTitle(ruleId: string, title: string, findingCount: number): string {
  if (ruleId !== "sensitive_keywords" || findingCount < 1) return title;
  return `${title} – ${findingCount} ${findingCount === 1 ? "time" : "times"}`;
}

export const ACCESSIBILITY_CHECKS = [
  { ruleId: "reflow", title: "Ensure pages don't scroll in two dimensions on small screens", impact: "serious" },
  { ruleId: "list", title: "Ensure lists are marked up correctly", impact: "minor" },
  { ruleId: "broken_anchor_links", title: "Avoid linking to anchors that do not exist", impact: "moderate" },
  { ruleId: "link_purpose_unclear", title: "Ensure links explain their purpose", impact: "moderate" },
  { ruleId: "meta-viewport", title: "Ensure pages don't require zooming and 2D scrolling on small screens", impact: "serious" },
  { ruleId: "focus_appearance", title: "Ensure controls clearly indicate when they are selected", impact: "minor" },
  { ruleId: "focus-visible", title: "Ensure controls change appearance when they are selected", impact: "serious" },
  { ruleId: "new_tab_disclosure", title: "Ensure links explain they open in a new tab", impact: "minor" },
  { ruleId: "pdf_not_tagged", title: "Tag all PDFs", impact: "serious" },
  { ruleId: "color-contrast", title: "Ensure text has sufficient contrast (AA)", impact: "serious" },
  { ruleId: "page-has-heading-one", title: "Ensure every page contains a top-level heading", impact: "moderate" },
  { ruleId: "pdf_no_title", title: "Ensure PDFs have a title", impact: "moderate" },
  { ruleId: "label", title: "Ensure form controls have labels", impact: "serious" },
  { ruleId: "autocomplete-valid", title: "Identify the purpose of fields programmatically", impact: "moderate" },
  { ruleId: "control_contrast", title: "Ensure form controls contrast sufficiently with their surroundings", impact: "moderate" },
  { ruleId: "reading_level_aaa", title: "Ensure content is not too difficult to understand", impact: "minor" },
  { ruleId: "image-redundant-alt", title: "Avoid alternative text that is the same as adjacent text", impact: "minor" },
  { ruleId: "scope-attr-valid", title: "Add a scope to table headings", impact: "moderate" },
  { ruleId: "empty-table-header", title: "Add headers to tables", impact: "moderate" },
  { ruleId: "listitem", title: "Write lists or groups of links semantically", impact: "minor" },
  { ruleId: "empty-heading", title: "Ensure headings include text", impact: "moderate" },
  { ruleId: "pdf_no_headings", title: "Specify headings for every PDF", impact: "moderate" },
  { ruleId: "color-contrast-enhanced", title: "Aim for text to have very high contrast (AAA)", impact: "minor" },
  { ruleId: "pdf_no_language", title: "Ensure PDFs specify a default language", impact: "moderate" },
  { ruleId: "target-size", title: "Aim for large interactive controls", impact: "minor" },
  { ruleId: "identical-links-same-purpose", title: "Avoid using the same link text for different destinations", impact: "moderate" },
  { ruleId: "fieldset_legend", title: "Add a legend for all fieldsets", impact: "moderate" },
  { ruleId: "pdf_heading_order", title: "Ensure PDF headings follow a logical order", impact: "moderate" },
  { ruleId: "link-name", title: "Ensure links can be used by screen readers", impact: "serious" },
  { ruleId: "label_misuse", title: "Only use labels for appropriate form controls", impact: "moderate" },
  { ruleId: "frame-title", title: "Specify a title for all frames", impact: "moderate" },
  { ruleId: "label_orphan_for", title: "Ensure labels in the document point to valid IDs", impact: "moderate" },
  { ruleId: "pdf_no_bookmarks", title: "Ensure long PDFs use bookmarks to aid navigation", impact: "minor" },
] as const;

export const ACCESSIBILITY_CHECK_ORDER = ACCESSIBILITY_CHECKS.map((check) => check.ruleId);

// Raw rule ids from the engine map onto the listed checks. Most are identity —
// the module lists the engine's own ids — with a few consolidations where several
// axe rules describe one listed check.
const ACCESSIBILITY_RULE_CONSOLIDATIONS: Record<string, (typeof ACCESSIBILITY_CHECK_ORDER)[number]> = {
  "definition-list": "list",
  dlitem: "listitem",
  "td-has-header": "empty-table-header",
  "th-has-data-cells": "empty-table-header",
  "frame-title-unique": "frame-title",
  "form-field-multiple-labels": "label_misuse",
  "label-title-only": "label",
  "target-size": "target-size",
};

const ACCESSIBILITY_RULE_ALIASES: Record<string, (typeof ACCESSIBILITY_CHECK_ORDER)[number]> = {
  ...Object.fromEntries(ACCESSIBILITY_CHECK_ORDER.map((ruleId) => [ruleId, ruleId])),
  ...ACCESSIBILITY_RULE_CONSOLIDATIONS,
};

export function accessibilityCheckRuleId(ruleId: string): string | null {
  return ACCESSIBILITY_RULE_ALIASES[ruleId] ?? null;
}

export function accessibilityCheckRank(ruleId: string): number {
  const rank = ACCESSIBILITY_CHECK_ORDER.indexOf(ruleId as (typeof ACCESSIBILITY_CHECK_ORDER)[number]);
  return rank === -1 ? ACCESSIBILITY_CHECK_ORDER.length : rank;
}

export const MARKETING_CHECKS = [
  { ruleId: "sitemap_missing", title: "Add a structured sitemap for search engines", impact: "serious", sectionLabel: "Technical optimization" },
  { ruleId: "spelling", title: "Check and fix misspellings", impact: "moderate" },
  { ruleId: "list", title: "Ensure lists are marked up correctly", impact: "minor" },
  { ruleId: "url_file_extension", title: "Avoid file extensions for pages", impact: "minor" },
  { ruleId: "image_optimization", title: "Consider optimizing images", impact: "minor" },
  { ruleId: "thin_pages", title: "Minimize \"thin\" pages", impact: "minor" },
  { ruleId: "page-has-heading-one", title: "Ensure every page contains a top-level heading", impact: "moderate" },
  { ruleId: "title_too_long", title: "Ensure page titles are not longer than 60 characters", impact: "minor" },
  { ruleId: "meta_description", title: "Specify meta descriptions for relevant pages", impact: "minor" },
  { ruleId: "page_missing_from_sitemap", title: "Add pages missing from Sitemap", impact: "minor" },
  { ruleId: "readability", title: "Consider making text easier to understand", impact: "minor" },
  { ruleId: "meta_description_too_short", title: "Ensure meta descriptions are at least 60 characters long", impact: "minor" },
  { ruleId: "listitem", title: "Write lists or groups of links semantically", impact: "minor" },
  { ruleId: "empty-heading", title: "Ensure headings include text", impact: "moderate" },
  { ruleId: "multiple_h1", title: "Avoid more than one H1 header per page", impact: "minor" },
  { ruleId: "url_underscores", title: "Avoid underscores in URLs", impact: "minor" },
] as const;

export const UX_CHECKS = [
  { ruleId: "reflow", title: "Ensure pages don't scroll in two dimensions on small screens", impact: "serious" },
  { ruleId: "defer_offscreen_images", title: "Defer offscreen images", impact: "minor" },
  { ruleId: "missing_images", title: "Fix missing images", impact: "serious" },
  { ruleId: "render_blocking_resources", title: "Eliminate render-blocking resources", impact: "moderate" },
  { ruleId: "unused_javascript", title: "Remove unused JavaScript", impact: "minor" },
  { ruleId: "image_modern_format", title: "Serve images in modern formats", impact: "minor" },
  { ruleId: "image_resolution", title: "Serve images in an appropriate resolution", impact: "minor" },
  { ruleId: "high_rtt", title: "Reduce Round Trip Times", impact: "minor" },
  { ruleId: "unused_css", title: "Remove unused CSS", impact: "minor" },
  { ruleId: "missing_js_files", title: "Fix missing JavaScript files", impact: "serious" },
  { ruleId: "js_execution_time", title: "Reduce JavaScript execution time", impact: "minor" },
  { ruleId: "missing_css_files", title: "Fix missing CSS files", impact: "serious" },
  { ruleId: "excessive_dom_size", title: "Avoid excessive DOM size", impact: "minor" },
  { ruleId: "legacy_javascript", title: "Avoid serving legacy JavaScript to modern browsers", impact: "minor" },
  { ruleId: "javascript_errors", title: "Fix JavaScript errors", impact: "moderate" },
  { ruleId: "third_party_impact", title: "Reduce the impact of third-party code", impact: "minor" },
  { ruleId: "cache_ttl", title: "Cache static assets efficiently", impact: "minor" },
  { ruleId: "font_display", title: "Ensure text remains visible during webfont load", impact: "minor" },
  { ruleId: "unminified_css", title: "Minify CSS", impact: "minor" },
  { ruleId: "preconnect_missing", title: "Preconnect to required origins", impact: "minor" },
  { ruleId: "image_optimization", title: "Consider optimizing images", impact: "minor" },
  { ruleId: "unminified_javascript", title: "Minify JavaScript", impact: "minor" },
  { ruleId: "time_to_interactive", title: "Ensure pages appear to load quickly", impact: "moderate" },
  { ruleId: "passive_event_listeners", title: "Use passive event listeners", impact: "minor" },
  { ruleId: "server_response_time", title: "Keep server response times short", impact: "moderate" },
] as const;

export const PRIVACY_CHECKS = [
  { ruleId: "privacy-policy-link", title: "Link every page to a privacy policy", impact: "serious" },
  { ruleId: "privacy_enhanced", title: "Enable enhanced privacy where possible", impact: "serious" },
  { ruleId: "cookie-consent", title: "Add a cookie disclaimer to every page", impact: "serious" },
  { ruleId: "cookie_ssl", title: "Ensure cookies are only sent over SSL", impact: "moderate" },
  { ruleId: "csp_missing", title: "Specify a Content Security Policy for all pages", impact: "moderate" },
  { ruleId: "hsts", title: "Use Strict Transport Security for all pages", impact: "moderate" },
  { ruleId: "technology_privacy", title: "Review privacy of technologies used", impact: "minor" },
] as const;

export const POLICIES_CHECKS = [
  { ruleId: "policy-privacy", title: "Link every page to a privacy policy", impact: "moderate" },
  { ruleId: "policy-cookie", title: "Add a cookie disclaimer to every page", impact: "minor" },
  { ruleId: "policies_sensitive_keywords", title: "Sensitive keywords", impact: "moderate" },
  { ruleId: "texas_senate_bill_17", title: "Texas Senate Bill 17", impact: "moderate" },
  { ruleId: "find_accessibility", title: "Find \"accessibility\"", impact: "minor" },
  { ruleId: "eeo_terms", title: "Identify Pages using EEO terms", impact: "minor" },
  { ruleId: "affirmative_action", title: "Identify Pages using Affirmative Action terms", impact: "minor" },
  { ruleId: "forms_inventory", title: "Find Forms and Applications", impact: "minor" },
] as const;

export function marketingCheckRank(ruleId: string): number {
  const rank = MARKETING_CHECKS.findIndex((check) => check.ruleId === ruleId);
  return rank === -1 ? MARKETING_CHECKS.length : rank;
}

export function uxCheckRank(ruleId: string): number {
  const rank = UX_CHECKS.findIndex((check) => check.ruleId === ruleId);
  return rank === -1 ? UX_CHECKS.length : rank;
}

export function privacyCheckRank(ruleId: string): number {
  const rank = PRIVACY_CHECKS.findIndex((check) => check.ruleId === ruleId);
  return rank === -1 ? PRIVACY_CHECKS.length : rank;
}

export function policiesCheckRank(ruleId: string): number {
  const rank = POLICIES_CHECKS.findIndex((check) => check.ruleId === ruleId);
  return rank === -1 ? POLICIES_CHECKS.length : rank;
}

export function policiesCheckTitle(ruleId: string, title: string, findingCount: number): string {
  if (ruleId !== "policies_sensitive_keywords" || findingCount < 1) return title;
  return `${title} – ${findingCount} ${findingCount === 1 ? "time" : "times"}`;
}

export function inspectorCheckTitle(category: string, ruleId: string): string | null {
  const definitions = category === "accessibility" ? ACCESSIBILITY_CHECKS
    : category === "marketing" ? MARKETING_CHECKS
    : category === "ux" ? UX_CHECKS
    : category === "privacy" ? PRIVACY_CHECKS
    : category === "policies" ? POLICIES_CHECKS
    : [];
  return definitions.find((check) => check.ruleId === ruleId)?.title ?? null;
}

export function inspectorSectionLabel(category: string, ruleId: string): string | null {
  if (category === "accessibility" && ruleId === "consistent_navigation") return "Failed Checks";
  const definitions = category === "marketing" ? MARKETING_CHECKS
    : category === "ux" ? UX_CHECKS
    : category === "privacy" ? PRIVACY_CHECKS
    : [];
  const definition = definitions.find((check) => check.ruleId === ruleId);
  return definition && "sectionLabel" in definition ? definition.sectionLabel : null;
}
