// Keep browser requests same-origin. Next.js forwards /compass/api/* to the
// FastAPI service, avoiding CORS and browser-extension interference.
import { API_BASE } from "@/lib/api-base";

const API_URL = API_BASE;

export type ScanStatus = "pending" | "crawling" | "scoring" | "done" | "failed";

export interface ScanSummary {
  id: string;
  root_url: string;
  status: ScanStatus;
  error: string | null;
  max_pages: number;
  max_depth: number;
  pages_crawled: number;
  pages_queued: number;
  pages_errored: number;

  overall_score: number | null;
  overall_band: string | null;
  accessibility_score: number | null;
  wcag_scores: Record<string, number>;
  category_scores: Record<string, number>;

  score_a: number | null;
  score_aa: number | null;
  score_aaa: number | null;

  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export interface PageSummary {
  id: string;
  url: string;
  depth: number;
  render_status: string;
  status_code: number | null;
  is_error_page: boolean;
  error: string | null;
  score: number | null;
  score_a: number | null;
  score_aa: number | null;
  score_aaa: number | null;
  issue_count: number;
  manual_review_count: number;
  stability_reason: string | null;
  cookie_rule: string | null;
  render_ms: number | null;
  desktop_screenshot_ref: string | null;
  mobile_screenshot_ref: string | null;
}

export type Category = "accessibility" | "content" | "marketing" | "ux";

export const CATEGORY_LABELS: Record<string, string> = {
  accessibility: "Accessibility",
  content: "Content",
  marketing: "Marketing",
  ux: "User Experience",
  privacy: "Privacy",
  policies: "Policies",
  "ttu-compliance": "TTU Compliance",
  "brand-standards": "Brand Standards",
  inventory: "Inventory",
};

/** Report sidebar order (mirrors the single-page test layout). */
export const REPORT_CATEGORY_ORDER = [
  "content",
  "accessibility",
  "marketing",
  "ux",
  "privacy",
  "policies",
  "ttu-compliance",
  "brand-standards",
  "inventory",
] as const;

/** Categories that carry a score (the rest are informational). */
export const SCORED_CATEGORIES = new Set(["content", "accessibility", "marketing", "ux", "privacy"]);

export interface CheckScore {
  rule_id: string;
  category: string;
  subcategory: string | null;
  criterion_id: string | null;
  criterion_name: string | null;
  wcag_version: string | null;
  wcag_level: string | null;
  is_best_practice: boolean;
  pages_affected: number;
  avg_issues: number;
  pct_affected: number;
  check_score: number;
  penalty: number;
}

export interface BBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface IssueInstance {
  issue_id: string;
  page_url: string;
  selector: string | null;
  html_snippet: string | null;
  bbox: BBox | null;
  viewport: string | null;
}

export interface IssueGroup {
  rule_id: string;
  category: string;
  subcategory: string | null;
  criterion_id: string | null;
  criterion_name: string | null;
  wcag_version: string | null;
  wcag_level: "A" | "AA" | "AAA" | null;
  is_best_practice: boolean;
  manual_review: boolean;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  description: string;
  remediation: string;
  reference_url: string;
  affected_page_count: number;
  total_instances: number;
  instances: IssueInstance[];
}

export type GrammarSource = "visible" | "title" | "alt_text" | "navigation";

export interface GrammarIssue {
  id: string;
  rule_id: string;
  excerpt: string;
  corrected_excerpt: string | null;
  error_text: string;
  replacement: string | null;
  source_type: GrammarSource;
  page_url: string;
  page_id: string;
  scan_id: string;
  quantity: number;
}

export interface GrammarGroup {
  group_name: string;
  severity: "error" | "warning";
  rule_ids: string[];
  issues: GrammarIssue[];
}

export interface GrammarIssuesResponse {
  total_issue_count: number;
  lang_codes_detected: string[];
  groups: GrammarGroup[];
}

export interface CategoryNode {
  key: string;
  label: string;
  score: number | null;
  children: CategoryNode[];
}

export interface ScanTree {
  scan_id: string;
  overall_score: number | null;
  overall_band: string | null;
  wcag_scores: Record<string, number>;
  categories: CategoryNode[];
}

export interface IssueOut {
  id: string;
  rule_id: string;
  display_name: string;
  check_description: string;
  category: string;
  subcategory: string | null;
  impact: "critical" | "serious" | "moderate" | "minor" | null;
  description: string;
  remediation: string;
  reference_url: string;
  wcag_version: string | null;
  wcag_level: "A" | "AA" | "AAA" | null;
  criterion_id: string | null;
  criterion_name: string | null;
  is_best_practice: boolean;
  manual_review: boolean;
  reviewed: boolean;
  selector: string | null;
  html_snippet: string | null;
  bbox: BBox | null;
  viewport: string | null;
}

export interface ScreenshotMeta {
  ref: string;
  css_width: number;
  dpr: number;
  page_width_px: number;
  page_height_px: number;
}

export interface PageDetail {
  id: string;
  scan_id: string;
  url: string;
  final_url: string | null;
  title: string | null;
  render_status: string;
  is_error_page: boolean;
  is_document: boolean;
  score: number | null;
  score_a: number | null;
  score_aa: number | null;
  score_aaa: number | null;
  category_scores: Record<string, number | null>;
  issue_count: number;
  manual_review_count: number;
  word_count: number | null;
  reading_age: number | null;
  render_ms: number | null;
  render_time_ms: number | null;
  status_code: number | null;
  http_status: number | null;
  last_scanned_at: string | null;
  issue_count_automated: number;
  issue_count_manual: number;
  dom_ref: string | null;
  screenshots: Record<string, ScreenshotMeta>;
  issues: IssueOut[];
}

export interface InstantReportData {
  slug: string;
  scan_id: string;
  url: string;
  status: "pending" | "crawling" | "scoring" | "done" | "failed";
  error: string | null;
  overall_score: number | null;
  overall_band: string | null;
  category_scores: Record<string, number>;
  wcag_scores: Record<string, number>;
  wcag_version: string | null;
  wcag_level: string | null;
  created_at: string;
  finished_at: string | null;
  engine_version: string;
  page: PageDetail | null;
}

export interface RetestJob {
  id: string;
  scan_id: string;
  url: string;
  state: "queued" | "rendering" | "auditing" | "finalizing" | "done" | "failed";
  error: string | null;
  queued_at: string | null;
  rendering_at: string | null;
  auditing_at: string | null;
  finalizing_at: string | null;
  done_at: string | null;
  result: {
    page_id?: string;
    page_score?: number;
    issue_count?: number;
    overall_score?: number;
    overall_band?: string;
    category_scores?: Record<string, number>;
  };
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`API ${res.status}: ${body}`);
  }
  return res.json() as Promise<T>;
}

export function createScan(url: string, maxPages?: number, maxDepth?: number) {
  return apiFetch<ScanSummary>("/scans", {
    method: "POST",
    body: JSON.stringify({ url, max_pages: maxPages, max_depth: maxDepth }),
  });
}

export function getScan(id: string) {
  return apiFetch<ScanSummary>(`/scans/${id}`);
}

export function getScanPages(id: string) {
  return apiFetch<PageSummary[]>(`/scans/${id}/pages`);
}

export function getScanIssues(id: string, includeManual = true) {
  return apiFetch<IssueGroup[]>(`/scans/${id}/issues?include_manual=${includeManual}`);
}

export function getGrammarIssues(siteId: string) {
  return apiFetch<GrammarIssuesResponse>(`/sites/${siteId}/checks/grammar/issues`);
}

export function approveGrammar(siteId: string, errorText: string) {
  return apiFetch<{ ok: boolean; approved_text: string; updated: number }>(
    `/sites/${siteId}/checks/grammar/approve`,
    { method: "POST", body: JSON.stringify({ error_text: errorText }) },
  );
}

export function ignoreGrammarRule(siteId: string, ruleId: string) {
  return apiFetch<{ ok: boolean; rule_id: string; updated: number }>(
    `/sites/${siteId}/checks/grammar/ignore-rule`,
    { method: "POST", body: JSON.stringify({ rule_id: ruleId }) },
  );
}

export function getScanChecks(id: string) {
  return apiFetch<CheckScore[]>(`/scans/${id}/checks`);
}

export function getScanTree(id: string) {
  return apiFetch<ScanTree>(`/scans/${id}/tree`);
}

export function getPageDetail(scanId: string, pageId: string) {
  return apiFetch<PageDetail>(`/scans/${scanId}/pages/${pageId}`);
}

export function createRetest(scanId: string, url: string) {
  return apiFetch<RetestJob>(`/scans/${scanId}/retest`, {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function getRetestJob(jobId: string) {
  return apiFetch<RetestJob>(`/retest-jobs/${jobId}`);
}

export function reviewIssue(issueId: string, reviewed: boolean) {
  return apiFetch<{ id: string; reviewed: boolean }>(`/issues/${issueId}/review`, {
    method: "POST",
    body: JSON.stringify({ reviewed }),
  });
}

export function ignoreIssue(issueId: string) {
  return apiFetch<{ id: string; ignored: boolean }>(`/issues/${issueId}/ignore`, {
    method: "POST",
  });
}

export function normalizeWebsiteUrl(value: string) {
  const trimmed = value.trim();
  if (!trimmed) throw new Error("Enter a website URL.");

  const normalized = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    const parsed = new URL(normalized);
    if (!parsed.hostname) throw new Error();
    return parsed.toString();
  } catch {
    throw new Error("Enter a valid website URL, such as example.com.");
  }
}

export function createInstantScan(url: string) {
  return apiFetch<{ scan_id: string; slug: string }>("/instant-scans", {
    method: "POST",
    body: JSON.stringify({ url }),
  });
}

export function getInstantReport(slug: string) {
  return apiFetch<InstantReportData>(`/r/${slug}`);
}

/** Absolute URL for a stored screenshot / DOM artifact. */
export function artifactUrl(scanId: string, ref: string) {
  return `${API_URL}/scans/${scanId}/artifact?ref=${encodeURIComponent(ref)}`;
}
