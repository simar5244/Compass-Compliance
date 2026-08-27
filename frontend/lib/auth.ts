/** Auth + platform API client. All requests send the session cookie
 * (credentials: include) so the httpOnly cookie authenticates them. */

import { API_BASE } from "@/lib/api-base";

const API_URL = API_BASE;

export interface Me {
  id: string;
  email: string;
  name: string;
  role: "admin" | "user";
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let msg = `${res.status}`;
    try {
      const body = await res.json();
      msg = body.detail ?? msg;
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, typeof msg === "string" ? msg : JSON.stringify(msg));
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export function login(email: string, password: string) {
  return apiFetch<Me>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) });
}
export function logout() {
  return apiFetch<{ ok: boolean }>("/auth/logout", { method: "POST" });
}
export function getMe() {
  return apiFetch<Me>("/auth/me");
}
export function changePassword(current_password: string, new_password: string) {
  return apiFetch<{ ok: boolean }>("/auth/change-password", {
    method: "POST",
    body: JSON.stringify({ current_password, new_password }),
  });
}

// ---- platform data ----
export interface Concerns { error: number; warning: number; info: number }
export interface SiteCard {
  id: string;
  name: string;
  root_url: string;
  overall_score: number | null;
  overall_band: string | null;
  pages: number | null;
  last_scanned_at: string | null;
  last_content_change: string | null;
  concerns: Concerns;
  score_history: number[];
  latest_scan_id: string | null;
  recrawl_interval_days: number;
  assigned_user_count?: number;
  active_scan: ActiveScan | null;
  max_pages: number;
  max_depth: number;
  crawl_limit_reached: boolean;
}

export interface ActiveScan {
  id: string;
  status: "pending" | "crawling" | "scoring" | "done" | "failed";
  pages_crawled: number;
  pages_queued: number;
  started_at: string;
}
export interface Dashboard { sites: SiteCard[]; totals: { sites: number; errors: number; warnings: number } }

export interface SiteDetail extends SiteCard {
  settings: { recrawl_interval_days: number; max_pages: number; max_depth: number; ignore_patterns: string[] };
  category_scores: Record<string, number>;
  wcag_scores: Record<string, number>;

  latest_desktop_screenshot_ref?: string | null;
  latest_mobile_screenshot_ref?: string | null;
  documents?: number;
}

export type SiteCheckRow = {
  check_id: string;
  display_name?: string;
  category: string;
  subcategory: string | null;
  criterion_id: string | null;
  criterion_name: string | null;
  wcag_version: string | null;
  wcag_level: string | null;
  is_best_practice: boolean;
  check_score: number | null;
  issues: number | null;
  severity: string | null;
  progress: number | null;
  blocked_by?: string | null;
  assisted?: boolean;
  /** Severity from the catalog, independent of whether this scan found issues. */
  catalog_severity?: string | null;
  description?: string;
  wcag_criterion?: string | null;
};

export interface RunListItem {
  scan_id: string;
  status: string;
  trigger: string;
  created_at: string;
  finished_at: string | null;
  pages: number | null;
  overall_score: number | null;
  category_scores: Record<string, number>;
  issues_new: number | null;
  issues_resolved: number | null;
  score_deltas: Record<string, number>;
}

export interface CompareResult {
  run_a: { id: string; started_at: string; page_count: number; overall_score: number | null; category_scores: Record<string, number> };
  run_b: { id: string; started_at: string; page_count: number; overall_score: number | null; category_scores: Record<string, number> };
  summary: {
    overall_delta: number | null;
    category_deltas: Record<string, { score_a: number | null; score_b: number | null; delta: number | null }>;
    issues_new: number;
    issues_resolved: number;
    issues_unchanged: number;
  };
  pages: { url: string; score_a: number | null; score_b: number | null; score_delta: number; content_changed: boolean; is_new_page: boolean; is_removed_page: boolean }[];
  issues_new_list: { rule_id: string; display_name: string; category: string; severity: string; page_url: string; page_id: string; scan_id: string }[];
  issues_resolved_list: { rule_id: string; display_name: string; category: string; severity: string; page_url: string }[];
  total_new: number;
  total_resolved: number;
}

export const getDashboard = () => apiFetch<Dashboard>("/sites");
export const getSite = (id: string) => apiFetch<SiteDetail>(`/sites/${id}`);
export const getRuns = (id: string) => apiFetch<{ runs: RunListItem[] }>(`/sites/${id}/runs`);
export const getRun = (id: string, runId: string) => apiFetch<Record<string, unknown>>(`/sites/${id}/runs/${runId}`);
export const compareRuns = (id: string, a: string, b: string) =>
  apiFetch<CompareResult>(`/sites/${id}/compare?a=${a}&b=${b}`);
export const scanNow = (id: string) => apiFetch<{ scan_id: string }>(`/sites/${id}/scan-now`, { method: "POST" });
export const updateSite = (id: string, patch: Record<string, unknown>) =>
  apiFetch<{ ok: boolean }>(`/sites/${id}`, { method: "PATCH", body: JSON.stringify(patch) });

export const getSiteChecks = (id: string, category?: string) =>
  apiFetch<{ scan_id: string | null; checks: SiteCheckRow[] }>(
    `/sites/${id}/checks${category ? `?category=${encodeURIComponent(category)}` : ""}`
  );

export const getSiteChecksFull = (id: string, category?: string) =>
  apiFetch<{ scan_id: string | null; checks: SiteCheckRow[] }>(
    `/sites/${id}/checks-full${category ? `?category=${encodeURIComponent(category)}` : ""}`
  );

export type SiteIssue = import("@/lib/api").IssueOut & { page_url: string; scan_id: string };

export const getSiteIssues = (siteId: string, category?: string, subcategory?: string) => {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (subcategory) query.set("subcategory", subcategory);
  const suffix = query.toString();
  return apiFetch<{ scan_id: string | null; issues: SiteIssue[] }>(
    `/sites/${siteId}/issues${suffix ? `?${suffix}` : ""}`
  );
};

export type SiteCheckDetail = {
  site_id: string;
  check_id: string;
  latest_scan_id: string;
  check: {
    category: string;
    subcategory: string | null;
    criterion_id: string | null;
    criterion_name: string | null;
    wcag_version: string | null;
    wcag_level: string | null;
    is_best_practice: boolean;
    check_score: number | null;
    severity: string | null;
    pages_affected: number;
    instances: number;
  };
  series: {
    scan_id: string;
    created_at: string;
    check_score: number | null;
    pages_affected: number | null;
    issues: number;
  }[];
  pages: {
    page_id: string;
    url: string;
    page_score: number | null;
    desktop_screenshot_ref: string | null;
    instances: number;
  }[];
  issues: (import("@/lib/api").IssueOut & { page_id: string; page_url: string; page_score: number | null })[];
};

export const getSiteCheckDetail = (siteId: string, checkId: string) =>
  apiFetch<SiteCheckDetail>(`/sites/${siteId}/checks/${encodeURIComponent(checkId)}`);

export type SitePageRow = {
  page_id: string;
  title?: string | null;
  cms?: string | null;
  url: string;
  depth: number;
  render_status: string;
  status_code: number | null;
  is_error_page: boolean;
  score: number | null;
  issue_count: number;
  manual_review_count: number;
  last_changed_at: string | null;
  render_unstable: boolean;
  desktop_screenshot_ref: string | null;
  mobile_screenshot_ref: string | null;
  word_count: number | null;
  sentence_count?: number | null;
  reading_age: number | null;
  is_document?: boolean;
  category_issue_count: number | null;
  category_score?: number | null;
};

export const getSitePages = (siteId: string, category?: string, includeDocuments = false) => {
  const query = new URLSearchParams();
  if (category) query.set("category", category);
  if (includeDocuments) query.set("include_documents", "true");
  const suffix = query.toString();
  return apiFetch<{ scan_id: string | null; pages: SitePageRow[] }>(
    `/sites/${siteId}/pages${suffix ? `?${suffix}` : ""}`
  );
};

export type SitePdfRow = {
  page_id: string;
  url: string;
  title?: string | null;
  /** Share of the PDF checks this document passes; null when it could not be parsed. */
  score: number | null;
  checks_total: number;
  checks_failed: number;
  issue_count: number;
};

export const getSitePdfs = (siteId: string, category?: string) =>
  apiFetch<{ scan_id: string | null; pdfs: SitePdfRow[] }>(
    `/sites/${siteId}/pdfs${category ? `?category=${encodeURIComponent(category)}` : ""}`
  );

export type SpellingWordRow = {
  word: string;
  /** likely | incorrect_case | different_language | potential */
  category: string;
  suggestions: string[];
  language: string | null;
  quantity: number;
  example_issue_id?: string | null;
  issue_ids: string[];
  page_urls: string[];
  page_ids?: string[];
  /** One entry per page, each with an issue that is actually on that page. */
  pages?: { page_id: string; page_url: string; issue_id: string }[];
  example_page_id: string | null;
  example_page_url: string | null;
};

export type CheckHistoryPoint = { scan_id: string; at: string; issues: number; score: number | null };

export const getCheckHistory = (siteId: string, checkId: string) =>
  apiFetch<{ check_id: string; points: CheckHistoryPoint[] }>(
    `/sites/${siteId}/checks/${encodeURIComponent(checkId)}/history`
  );

export type ModuleHistoryPoint = { scan_id: string; at: string; score: number; checks_scored: number };

export const getModuleHistory = (siteId: string, module: string) =>
  apiFetch<{ module: string; points: ModuleHistoryPoint[] }>(
    `/sites/${siteId}/modules/${encodeURIComponent(module)}/history`
  );

export type AccessibilityOverview = {
  score: number | null;
  levels: Record<"a" | "aa" | "aaa", { score: number | null; delta: number | null }>;
  history: { at: string; score: number | null; a: number | null; aa: number | null; aaa: number | null }[];
  common_issues: { rule_id: string; name: string; issues: number }[];
  issues_per_page: { label: string; average: number; pages: number; is_total: boolean }[];
  disability_groups: { group: string; failing_checks: number }[];
};

export const getAccessibilityOverview = (siteId: string) =>
  apiFetch<AccessibilityOverview>(`/sites/${siteId}/accessibility/overview`);

export type MarketingOverview = {
  score: number | null;
  groups: Record<"content_optimization" | "technical_optimization", { score: number | null; delta: number | null }>;
  words: { total: number | null };
  history: {
    at: string;
    score: number | null;
    content_optimization: number | null;
    technical_optimization: number | null;
    words: number | null;
  }[];
};

export const getMarketingOverview = (siteId: string) =>
  apiFetch<MarketingOverview>(`/sites/${siteId}/marketing/overview`);

export type AmountOfContent = {
  totals: { words: number | null; sentences: number | null; words_per_page: number | null };
  history: { at: string; words: number | null; sentences: number | null; words_per_page: number | null }[];
};

export const getAmountOfContent = (siteId: string) =>
  apiFetch<AmountOfContent>(`/sites/${siteId}/marketing/amount-of-content`);

export type VitalsExperience = {
  form_factor: string;
  device: string;
  connection: string;
  score: number | null;
  largest_contentful_paint_ms: number | null;
  first_input_delay_ms: number | null;
  cumulative_layout_shift: number | null;
  total_blocking_time_ms: number | null;
  first_contentful_paint_ms: number | null;
  speed_index_ms: number | null;
  frames: { timing_ms: number | null; data: string }[];
};

export type WebVitals = {
  score: number | null;
  delta: number | null;
  metrics: {
    largest_contentful_paint_ms: number | null;
    first_input_delay_ms: number | null;
    cumulative_layout_shift: number | null;
  };
  experiences: VitalsExperience[];
  history: { at: string; score: number | null }[];
};

export const getWebVitals = (siteId: string) =>
  apiFetch<WebVitals>(`/sites/${siteId}/ux/web-vitals`);

export type PrivacyFormField = { label: string; required: boolean; type: string };

export type PrivacyForm = {
  signature: string;
  action: string;
  method: string;
  sensitive_fields: string[];
  field_count: number;
  fields: PrivacyFormField[];
  quantity: number;
  issue_ids: string[];
  pages: { page_id: string; page_url: string }[];
};

export const getPrivacyForms = (siteId: string) =>
  apiFetch<{ scan_id: string | null; forms: PrivacyForm[] }>(`/sites/${siteId}/privacy/forms`);

export type PrivacyOverview = {
  score: number | null;
  groups: Record<"consent" | "audit" | "security", { score: number | null; delta: number | null }>;
  history: {
    at: string;
    score: number | null;
    consent: number | null;
    audit: number | null;
    security: number | null;
  }[];
};

export const getPrivacyOverview = (siteId: string) =>
  apiFetch<PrivacyOverview>(`/sites/${siteId}/privacy/overview`);

export type ExposedValue = {
  value: string;
  quantity: number;
  issue_ids: string[];
  pages: { page_id: string; page_url: string }[];
};

export type ExposedPhone = ExposedValue & { formatted: string; location: string; country: string };
export type ExposedEmail = ExposedValue & { hostname: string };

export const getPrivacyPhoneNumbers = (siteId: string) =>
  apiFetch<{ scan_id: string | null; numbers: ExposedPhone[] }>(`/sites/${siteId}/privacy/phone-numbers`);

export const getPrivacyEmails = (siteId: string) =>
  apiFetch<{ scan_id: string | null; emails: ExposedEmail[] }>(`/sites/${siteId}/privacy/emails`);

export const getCheckWords = (siteId: string, checkId: string) =>
  apiFetch<{ scan_id: string | null; check_id: string; items: SpellingWordRow[] }>(
    `/sites/${siteId}/checks/${encodeURIComponent(checkId)}/words`
  );

export type BrokenLinkRow = {
  url: string;
  link_type: "internal" | "external";
  status_text: string;
  http_status?: number | null;
  error_type?: string | null;
  anchor_text?: string | null;
  quantity: number;
  page_urls: string[];
  issue_ids: string[];
  example_page_id?: string | null;
  example_page_url?: string | null;
};

export const getCheckLinks = (siteId: string, checkId: string) =>
  apiFetch<{ scan_id: string | null; check_id: string; items: BrokenLinkRow[] }>(
    `/sites/${siteId}/checks/${encodeURIComponent(checkId)}/links`
  );

export type BrokenLinkInstanceRow = {
  issue_id: string;
  page_id: string;
  page_url: string;
  page_score: number | null;
  page_issue_count: number;
  page_manual_review_count: number;
  viewport: string | null;
  has_bbox: boolean;
};

export type BrokenLinkFullRow = {
  url: string;
  link_type: "internal" | "external";
  status_text: string;
  http_status: number | null;
  error_type: string | null;
  anchor_text: string | null;
  pages_affected: number;
  instances: BrokenLinkInstanceRow[];
};

export const getCheckLinksFull = (siteId: string, checkId: string) =>
  apiFetch<{ scan_id: string | null; check_id: string; items: BrokenLinkFullRow[] }>(
    `/sites/${siteId}/checks/${encodeURIComponent(checkId)}/links-full`
  );

export const ignoreIssues = (siteId: string, issue_ids: string[]) =>
  apiFetch<{ ok: boolean; updated: number }>(`/sites/${siteId}/issues/ignore`, {
    method: "POST",
    body: JSON.stringify({ issue_ids }),
  });

export type IssueLookupRow = {
  id: string;
  page_id: string;
  page_url: string;
  scan_id: string;
  viewport: string | null;
  has_bbox: boolean;
};

export const lookupIssues = (siteId: string, issue_ids: string[]) =>
  apiFetch<{ items: IssueLookupRow[] }>(`/sites/${siteId}/issues/lookup`, {
    method: "POST",
    body: JSON.stringify({ issue_ids }),
  });

// ---- admin ----
export interface AdminUser { id: string; email: string; name: string; role: string; assigned_site_ids: string[] }
export const adminListUsers = () => apiFetch<{ users: AdminUser[] }>("/admin/users");
export const adminCreateUser = (email: string, password: string, role: string, name = "") =>
  apiFetch<AdminUser>("/admin/users", { method: "POST", body: JSON.stringify({ email, password, role, name }) });
export const adminSetRole = (userId: string, role: string) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${userId}/role`, { method: "PATCH", body: JSON.stringify({ role }) });
export const adminResetPassword = (userId: string, new_password: string) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${userId}/reset-password`, { method: "POST", body: JSON.stringify({ new_password }) });
export const adminAssign = (userId: string, site_id: string) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${userId}/assignments`, { method: "POST", body: JSON.stringify({ site_id }) });
export const adminUnassign = (userId: string, siteId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${userId}/assignments/${siteId}`, { method: "DELETE" });
export const adminDeleteUser = (userId: string) =>
  apiFetch<{ ok: boolean }>(`/admin/users/${userId}`, { method: "DELETE" });
export const adminCreateSite = (root_url: string, name: string) =>
  apiFetch<{ id: string; root_url: string; name: string }>("/admin/sites", {
    method: "POST", body: JSON.stringify({ root_url, name }),
  });
