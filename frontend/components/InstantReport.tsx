"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CompassLoader } from "@/components/CompassLoader";
import { CompassLogo } from "@/components/CompassLogo";
import {
  artifactUrl,
  CATEGORY_LABELS,
  createRetest,
  getInstantReport,
  getRetestJob,
  REPORT_CATEGORY_ORDER,
  SCORED_CATEGORIES,
  type InstantReportData,
  type IssueOut,
  type PageDetail,
} from "@/lib/api";
import {
  ACCESSIBILITY_CHECKS,
  MARKETING_CHECKS,
  UX_CHECKS,
  PRIVACY_CHECKS,
  POLICIES_CHECKS,
  accessibilityCheckRuleId,
  accessibilityCheckRank,
  CONTENT_CHECKS,
  contentCheckRank,
  contentCheckTitle,
  inspectorCheckTitle,
  inspectorSectionLabel,
  marketingCheckRank,
  uxCheckRank,
  privacyCheckRank,
  policiesCheckRank,
  policiesCheckTitle,
  filterBySearch,
  severityRank,
  thresholdText,
  type CheckConfig,
} from "@/lib/report";
import { IssueAIPanel } from "@/components/IssueAIPanel";
import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";
import { CheckDetailPanel } from "@/components/inspector/CheckDetailPanel";
import { formatHtml } from "@/lib/formatHtml";

const RETEST_STATES = ["queued", "rendering", "auditing", "finalizing", "done"];
const VIEWPORT_LABELS: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", narrow: "Narrow 320px" };
const WCAG_VERSIONS = ["2.0", "2.1", "2.2"];
const WCAG_LEVELS = ["A", "AA", "AAA"];
const PAGE_SIZE = 10;

interface CheckGroup {
  key: string;
  ruleId: string;
  category: string;
  subcategory: string | null;
  title: string;
  criterionId: string | null;
  criterionName: string | null;
  wcagVersion: string | null;
  wcagLevel: string | null;
  worstImpact: string | null;
  issues: IssueOut[];
}

export function highlightedIssues(
  issues: IssueOut[],
  activeCheckKey: string | null,
  viewport: string,
): IssueOut[] {
  if (!activeCheckKey) return [];
  return issues
    .filter((issue) => issue.bbox && (issue.viewport ?? "desktop") === viewport)
    .filter((issue) => {
      const displayedRuleId = issue.category === "accessibility"
        ? accessibilityCheckRuleId(issue.rule_id)
        : issue.rule_id;
      return `${issue.category}:${displayedRuleId}` === activeCheckKey;
    });
}

function checkTitle(ruleId: string, issue: IssueOut): string {
  return issue.display_name || issue.criterion_name || issue.description || ruleId;
}

function occurrenceLabel(issue: IssueOut): string {
  try {
    const payload = JSON.parse(issue.html_snippet || "{}") as Record<string, unknown>;
    if (issue.rule_id === "sensitive_keywords") {
      return String(payload.matched_text || payload.error_text || issue.description);
    }
    return String(
      payload.text
      || payload.href
      || payload.description
      || payload.context
      || payload.error_text
      || issue.selector
      || issue.description,
    );
  } catch {
    return issue.html_snippet || issue.selector || issue.description;
  }
}

function SevIcon({ impact }: { impact: string | null }) {
  if (impact === "critical" || impact === "serious") {
    return (
      <span aria-hidden className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-black text-[13px] font-bold leading-none text-white">
        !
      </span>
    );
  }
  if (impact === "moderate") {
    return (
      <span aria-hidden className="relative inline-block h-5 w-5 flex-none text-[#737373]">
        <span className="absolute -top-[5px] left-0 text-[25px] leading-none">▲</span>
        <span className="absolute left-[8px] top-[2px] text-[11px] font-bold leading-none text-white">!</span>
      </span>
    );
  }
  return (
    <span aria-hidden className="inline-flex h-[19px] w-[19px] flex-none items-center justify-center rounded-[3px] bg-[#a3a3a3] text-[12px] font-bold text-white">
      !
    </span>
  );
}

/** WCAG version/level filter predicate: an accessibility issue passes if its
 * criterion is included at or below the selected version and level. */
function passesWcagFilter(issue: IssueOut, version: string | null, level: string | null): boolean {
  if (issue.category !== "accessibility") return true;
  if (!issue.criterion_id) return true; // best-practice always shown
  if (version && issue.wcag_version && WCAG_VERSIONS.indexOf(issue.wcag_version) > WCAG_VERSIONS.indexOf(version))
    return false;
  if (level && issue.wcag_level && WCAG_LEVELS.indexOf(issue.wcag_level) > WCAG_LEVELS.indexOf(level))
    return false;
  return true;
}

export function InstantReport({ slug }: { slug: string }) {
  const router = useRouter();
  const [report, setReport] = useState<InstantReportData | null>(null);
  const [checkConfig, setCheckConfig] = useState<CheckConfig | null>(null);
  const [error, setError] = useState<string | null>(null);

  // view state
  const [viewport, setViewport] = useState("desktop");
  const [showHtml, setShowHtml] = useState(false);
  const [hideHighlights, setHideHighlights] = useState(false);
  const [tab, setTab] = useState<"issues" | "info">("issues");
  const [search, setSearch] = useState("");
  const [selectedCheck, setSelectedCheck] = useState<string | null>(null);
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [aiIssue, setAiIssue] = useState<IssueOut | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<Set<string>>(new Set());
  const [showFullDesc, setShowFullDesc] = useState(false);
  const [wcagVersion, setWcagVersion] = useState<string | null>(null);
  const [wcagLevel, setWcagLevel] = useState<string | null>(null);
  const [retest, setRetest] = useState<{ state: string } | null>(null);
  const [domHtml, setDomHtml] = useState<string>("");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [imgWidth, setImgWidth] = useState(0);

  const load = useCallback(async () => {
    try {
      const r = await getInstantReport(slug);
      setReport(r);
      if (r.wcag_version && wcagVersion === null) setWcagVersion(r.wcag_version);
      if (r.wcag_level && wcagLevel === null) setWcagLevel(r.wcag_level);
      const vps = r.page ? Object.keys(r.page.screenshots) : [];
      if (vps.length && !vps.includes(viewport)) setViewport(vps[0]);
      return r;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load report");
      return null;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  // Poll until the scan finishes.
  useEffect(() => {
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    (async function tick() {
      const r = await load();
      if (cancelled) return;
      if (r && (r.status === "pending" || r.status === "crawling" || r.status === "scoring")) {
        timer = setTimeout(tick, 2000);
      }
    })();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [load]);

  useEffect(() => {
    fetch("/api/check-config")
      .then((r) => r.json())
      .then(setCheckConfig)
      .catch(() => {});
  }, []);

  // Load serialized DOM for the Show HTML view (once).
  useEffect(() => {
    if (showHtml && report?.page?.dom_ref && !domHtml) {
      fetch(artifactUrl(report.page.scan_id, report.page.dom_ref))
        .then((r) => r.text())
        .then(setDomHtml)
        .catch(() => setDomHtml("<!-- DOM snapshot unavailable -->"));
    }
  }, [showHtml, report, domHtml]);

  useLayoutEffect(() => {
    const measure = () => setImgWidth(imgRef.current?.clientWidth ?? 0);
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [report, viewport, showHtml]);

  const page = report?.page ?? null;
  const formattedDomHtml = useMemo(
    () => (domHtml ? formatHtml(domHtml) : ""),
    [domHtml],
  );

  // Build check groups from the page's issues.
  const checks = useMemo<CheckGroup[]>(() => {
    if (!page) return [];
    const query = search.trim().toLowerCase();
    const searched = page.issues.filter((issue) => {
      if (!query) return true;
      if (filterBySearch([issue], search).length) return true;
      const displayedRuleId = issue.category === "accessibility" ? accessibilityCheckRuleId(issue.rule_id) : issue.rule_id;
      return !!(displayedRuleId && inspectorCheckTitle(issue.category, displayedRuleId)?.toLowerCase().includes(query));
    }).filter((i) => passesWcagFilter(i, wcagVersion, wcagLevel));
    const map = new Map<string, CheckGroup>();
    for (const i of searched) {
      const displayedRuleId = i.category === "accessibility" ? accessibilityCheckRuleId(i.rule_id) : i.rule_id;
      if (!displayedRuleId
        || (i.category === "marketing" && marketingCheckRank(displayedRuleId) === MARKETING_CHECKS.length)
        || (i.category === "ux" && uxCheckRank(displayedRuleId) === UX_CHECKS.length)
        || (i.category === "privacy" && privacyCheckRank(displayedRuleId) === PRIVACY_CHECKS.length)
        || (i.category === "policies" && policiesCheckRank(displayedRuleId) === POLICIES_CHECKS.length)) continue;
      const key = `${i.category}:${displayedRuleId}`;
      if (!map.has(key)) {
        map.set(key, {
          key, ruleId: displayedRuleId, category: i.category, subcategory: i.subcategory,
          title: checkTitle(displayedRuleId, i),
          criterionId: i.criterion_id, criterionName: i.criterion_name,
          wcagVersion: i.wcag_version, wcagLevel: i.wcag_level,
          worstImpact: i.impact, issues: [],
        });
      }
      const g = map.get(key)!;
      g.issues.push(i);
      if (severityRank(i.impact) < severityRank(g.worstImpact)) g.worstImpact = i.impact;
    }
    const contentQuery = search.trim().toLowerCase();
    for (const definition of CONTENT_CHECKS) {
      const key = `content:${definition.ruleId}`;
      const matchesSearch = !contentQuery
        || `${definition.title} ${definition.ruleId}`.toLowerCase().includes(contentQuery);
      const existing = map.get(key);
      if (existing) {
        existing.title = contentCheckTitle(definition.ruleId, definition.title, existing.issues.length);
        existing.worstImpact = definition.impact;
      } else if (matchesSearch) {
        map.set(key, {
          key,
          ruleId: definition.ruleId,
          category: "content",
          subcategory: null,
          title: definition.title,
          criterionId: null,
          criterionName: null,
          wcagVersion: null,
          wcagLevel: null,
          worstImpact: definition.impact,
          issues: [],
        });
      }
    }
    for (const definition of ACCESSIBILITY_CHECKS) {
      const key = `accessibility:${definition.ruleId}`;
      const matchesSearch = !contentQuery
        || `${definition.title} ${definition.ruleId}`.toLowerCase().includes(contentQuery);
      const existing = map.get(key);
      if (existing) {
        existing.title = definition.title;
      } else if (matchesSearch) {
        map.set(key, {
          key, ruleId: definition.ruleId, category: "accessibility", subcategory: null,
          title: definition.title, criterionId: null, criterionName: null,
          wcagVersion: null, wcagLevel: null, worstImpact: definition.impact, issues: [],
        });
      }
    }
    for (const [category, definitions] of [
      ["marketing", MARKETING_CHECKS], ["ux", UX_CHECKS],
      ["privacy", PRIVACY_CHECKS], ["policies", POLICIES_CHECKS],
    ] as const) {
      for (const definition of definitions) {
        const key = `${category}:${definition.ruleId}`;
        const matchesSearch = !contentQuery
          || `${definition.title} ${definition.ruleId}`.toLowerCase().includes(contentQuery);
        const existing = map.get(key);
        if (existing) existing.title = category === "policies"
          ? policiesCheckTitle(definition.ruleId, definition.title, existing.issues.length)
          : definition.title;
        else if (matchesSearch) map.set(key, {
          key, ruleId: definition.ruleId, category, subcategory: null, title: definition.title,
          criterionId: null, criterionName: null, wcagVersion: null, wcagLevel: null,
          worstImpact: definition.impact, issues: [],
        });
      }
    }
    return [...map.values()].sort((a, b) => {
      if (a.category === "content" && b.category === "content") {
        return contentCheckRank(a.ruleId) - contentCheckRank(b.ruleId);
      }
      if (a.category === "accessibility" && b.category === "accessibility") {
        return accessibilityCheckRank(a.ruleId) - accessibilityCheckRank(b.ruleId);
      }
      if (a.category === "marketing" && b.category === "marketing") return marketingCheckRank(a.ruleId) - marketingCheckRank(b.ruleId);
      if (a.category === "ux" && b.category === "ux") return uxCheckRank(a.ruleId) - uxCheckRank(b.ruleId);
      if (a.category === "privacy" && b.category === "privacy") return privacyCheckRank(a.ruleId) - privacyCheckRank(b.ruleId);
      if (a.category === "policies" && b.category === "policies") return policiesCheckRank(a.ruleId) - policiesCheckRank(b.ruleId);
      return severityRank(a.worstImpact) - severityRank(b.worstImpact);
    });
  }, [page, search, wcagVersion, wcagLevel]);

  const checksByCategory = useMemo(() => {
    const m = new Map<string, CheckGroup[]>();
    for (const cat of REPORT_CATEGORY_ORDER) m.set(cat, []);
    for (const c of checks) {
      if (!m.has(c.category)) m.set(c.category, []);
      m.get(c.category)!.push(c);
    }
    return m;
  }, [checks]);

  const shot = page?.screenshots[viewport];
  const thumbnailShot = page?.screenshots.desktop ?? (page ? Object.values(page.screenshots)[0] : undefined);
  const thumbnailUrl = page && thumbnailShot ? artifactUrl(page.scan_id, thumbnailShot.ref) : null;
  const scale = shot && shot.css_width ? imgWidth / shot.css_width : 1;

  const activeCheck = checks.find((c) => c.key === selectedCheck) ?? null;
  // Keep the captured page clean until the user chooses a check. Previously,
  // the empty selection matched every issue and painted all boxes immediately.
  const boxes = selectedIssueId
    ? highlightedIssues(page?.issues ?? [], activeCheck?.key ?? null, viewport)
        .filter((issue) => issue.id === selectedIssueId)
    : [];

  function selectFinding(issue: IssueOut) {
    setSelectedIssueId(issue.id);
    const vp = issue.viewport ?? "desktop";
    if (issue.bbox && !showHtml) {
      if (vp !== viewport && page?.screenshots[vp]) setViewport(vp);
      requestAnimationFrame(() => {
        boxRefs.current[issue.id]?.scrollIntoView({ behavior: "smooth", block: "center" });
        setPulseId(issue.id);
        setTimeout(() => setPulseId(null), 1200);
      });
    } else if (showHtml && issue.html_snippet) {
      // flash the element's markup in the code view
      const el = document.getElementById("dom-code");
      if (el) {
        const idx = el.textContent?.indexOf(issue.html_snippet.slice(0, 40)) ?? -1;
        if (idx >= 0) {
          setPulseId(issue.id);
          setTimeout(() => setPulseId(null), 1200);
        }
      }
    }
  }

  async function runRetest() {
    if (!report) return;
    const job = await createRetest(report.scan_id, report.url);
    setRetest({ state: job.state });
    const poll = async () => {
      const j = await getRetestJob(job.id);
      setRetest({ state: j.state });
      if (j.state === "done") {
        setDomHtml("");
        await load();
        setTimeout(() => setRetest(null), 2000);
      } else if (j.state !== "failed") {
        setTimeout(poll, 1500);
      }
    };
    setTimeout(poll, 1200);
  }

  function toggleReviewed(id: string) {
    setReviewed((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  if (error) {
    return (
      <div className="light-theme flex min-h-screen flex-col items-center justify-center bg-white px-6 py-16 text-black">
        <div className="w-full max-w-xl border border-[#e5e5e5] bg-white p-8">
          <CompassLogo size="md" showName={false} />
          <h1 className="mt-4 text-2xl font-semibold text-black">Report unavailable</h1>
          <p className="mt-2 text-sm leading-6 text-[#737373]">{error}</p>
        </div>
      </div>
    );
  }
  if (!report) return <ReportSkeleton />;

  const domain = (() => {
    try {
      return new URL(report.url).hostname;
    } catch {
      return report.url;
    }
  })();
  const running = ["pending", "crawling", "scoring"].includes(report.status);
  const viewports = page ? Object.keys(page.screenshots) : [];

  return (
    <div className="light-theme flex h-screen flex-col bg-white text-black">
      <header className="flex h-14 flex-none items-center gap-3 border-b border-[#e5e5e5] bg-black px-3 text-white">
        <button type="button" onClick={() => router.push("/dashboard")} className="flex h-8 w-8 flex-none items-center justify-center text-[28px] font-light text-white" aria-label="Close report">
          ×
        </button>
        <div className="hidden translate-y-[7px] sm:block">
          <CompassLogo size="sm" inverted showName={false} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[15px] font-semibold leading-5 text-white">{page?.title?.trim() || domain}</div>
          <div className="truncate text-[12px] leading-4 text-[#a3a3a3]">{report.url}</div>
        </div>
        {retest ? (
          <div className="flex flex-wrap items-center gap-1.5 text-xs">
            {RETEST_STATES.map((s) => {
              const active = retest.state !== "failed" && RETEST_STATES.indexOf(s) <= RETEST_STATES.indexOf(retest.state);
              return (
                <span key={s} className={active ? "font-semibold text-white" : "text-[#737373]"}>{s}</span>
              );
            })}
          </div>
        ) : (
          <>
            <button type="button" onClick={() => router.push("/inspect")} className="flex-none rounded-[3px] border border-[#737373] px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#262626]">
              Test another
            </button>
            <button type="button" onClick={runRetest} disabled={running} className="flex-none rounded-[3px] bg-white px-4 py-2 text-[13px] font-semibold text-black hover:bg-[#f5f5f5] disabled:opacity-50">
              Retest
            </button>
          </>
        )}
      </header>

      {running ? (
        <div className="flex flex-1 items-center justify-center bg-white">
          <CompassLoader label={`Testing ${domain}… ${report.status}`} size="lg" />
        </div>
      ) : report.status === "failed" ? (
        <div className="flex flex-1 items-center justify-center bg-white px-6">
          <div className="w-full max-w-xl border border-[#e5e5e5] bg-white p-8">
            <h2 className="text-xl font-semibold text-black">Scan failed</h2>
            <p className="mt-2 text-sm leading-6 text-[#737373]">{report.error}</p>
          </div>
        </div>
      ) : (
        <div className="relative flex min-h-0 flex-1 flex-col md:flex-row">
          {sidebarCollapsed && (
            <button
              type="button"
              onClick={() => setSidebarCollapsed(false)}
              className="absolute left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-[3px] border border-l-0 border-[#e5e5e5] bg-white px-2 py-3 text-[12px] font-semibold text-black shadow-sm hover:bg-[#fafafa] md:left-0"
              aria-label="Show issues panel"
            >
              Issues
            </button>
          )}

          {!sidebarCollapsed && (
          <aside className="flex w-full flex-none flex-col overflow-hidden border-r border-[#e5e5e5] bg-[#f5f5f5] md:w-[382px]">
            {tab === "issues" ? (
              activeCheck ? (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
                  <CheckDetailPanel
                    issue={activeCheck.issues[0] ?? null}
                    ruleId={activeCheck.ruleId}
                    displayName={activeCheck.title}
                    instances={activeCheck.issues}
                    pageUrl={page?.url ?? report.url}
                    pageThumbnailUrl={thumbnailUrl}
                    onSelectInstance={selectFinding}
                    onAskAIInstance={(issue) => { selectFinding(issue); setAiIssue(issue); }}
                    onBack={() => { setSelectedCheck(null); setShowFullDesc(false); }}
                  />
                </div>
              ) : (
                <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
                  <div className="flex items-center gap-3 px-3 pb-3 pt-3">
                    <InspectorScoreRing score={report.overall_score} size={60} stroke={4} />
                    <div>
                      <div className="text-[21px] font-semibold leading-6 text-black">Overall</div>
                      <div className="text-[13px] leading-5 text-[#737373]">Score for this page</div>
                    </div>
                  </div>
                  <div className="px-3 pb-3">
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder="Search"
                      aria-label="Search checks"
                      className="h-[37px] w-full rounded-[3px] border border-[#e5e5e5] bg-white px-2 text-[14px] text-black outline-none placeholder:text-[#a3a3a3] focus:border-black"
                    />
                  </div>
                  <div className="min-h-0 flex-1 px-[7px] pb-6 pt-3">
                    {REPORT_CATEGORY_ORDER.map((cat) => (
                      <CategorySection
                        key={cat}
                        category={cat}
                        score={SCORED_CATEGORIES.has(cat) ? report.category_scores[cat] ?? null : null}
                        scored={SCORED_CATEGORIES.has(cat)}
                        checks={checksByCategory.get(cat) ?? []}
                        onSelect={(c) => { setSelectedCheck(c.key); setSelectedIssueId(null); setAiIssue(null); }}
                      />
                    ))}
                  </div>
                </div>
              )
            ) : (
              <InfoTab report={report} page={page} />
            )}

            {/* bottom tabs */}
            <div className="flex h-[41px] flex-none border-t border-[#e5e5e5] bg-black">
              {(["issues", "info"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={`flex-1 text-[13px] font-semibold capitalize text-white ${tab === t ? "bg-[#262626]" : "bg-black hover:bg-[#171717]"}`}
                >
                  {t}
                </button>
              ))}
            </div>
          </aside>
          )}

          {/* MAIN PANE */}
          <main className="flex min-h-0 min-w-0 flex-1 flex-col bg-white">
            <div className="flex min-h-[55px] flex-none flex-wrap items-center gap-2 border-b border-[#e5e5e5] bg-white px-2 text-[13px]">
              <select value={viewport} onChange={(e) => setViewport(e.target.value)} className="rounded-[3px] border border-black bg-black px-4 py-2 font-semibold text-white">
                {viewports.map((vp) => (
                  <option key={vp} value={vp}>{VIEWPORT_LABELS[vp] ?? vp}</option>
                ))}
              </select>
              <button onClick={() => setShowHtml((v) => !v)} className={`rounded-[3px] px-4 py-2 font-semibold ${showHtml ? "bg-black text-white" : "border border-[#e5e5e5] bg-white text-black hover:bg-[#f5f5f5]"}`}>
                Show HTML
              </button>
              <button onClick={() => setHideHighlights((v) => !v)} className="rounded-[3px] border border-[#e5e5e5] bg-white px-4 py-2 font-semibold text-black hover:bg-[#f5f5f5]">
                {hideHighlights ? "Show highlights" : "Hide highlights"}
              </button>
              <button disabled title="Coming soon" className="ml-auto cursor-not-allowed rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-4 py-2 font-semibold text-[#a3a3a3]">
                Simulations
              </button>
            </div>

            <div
              className="min-h-0 min-w-0 flex-1 overflow-auto"
              onClick={() => setSidebarCollapsed(true)}
            >
              {showHtml ? (
                <pre
                  id="dom-code"
                  className="block h-full w-full min-w-0 overflow-auto bg-black p-4 text-left font-mono text-[11px] leading-relaxed text-[#e5e5e5]"
                >
                  <code className="block whitespace-pre">{formattedDomHtml || "Loading DOM…"}</code>
                </pre>
              ) : shot ? (
                <div className="relative mx-auto w-full bg-white">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img ref={imgRef} src={artifactUrl(page!.scan_id, shot.ref)} alt="Rendered page" className="block w-full" onLoad={() => setImgWidth(imgRef.current?.clientWidth ?? 0)} />
                  {!hideHighlights && boxes.map((issue) => {
                    const b = issue.bbox!;
                    const sel = issue.id === selectedIssueId;
                        const color = "#000000";
                    return (
                      <div
                        key={issue.id}
                        ref={(el) => { boxRefs.current[issue.id] = el; }}
                        onClick={() => setSelectedIssueId(issue.id)}
                        className="absolute cursor-pointer"
                        style={{
                          left: b.x * scale, top: b.y * scale,
                          width: Math.max(b.width * scale, 4), height: Math.max(b.height * scale, 4),
                          border: `2px solid ${color}`,
                          backgroundColor: "transparent",
                          boxShadow: issue.id === pulseId ? `0 0 0 4px ${color}66` : "none",
                          transition: "box-shadow 0.3s", zIndex: sel ? 20 : 10,
                        }}
                      >
                        <div
                          className="absolute left-1/2 max-w-[300px] -translate-x-1/2 rounded-[3px] bg-black px-4 py-2 text-center text-[13px] font-semibold leading-4 text-white shadow-lg"
                          style={{ bottom: "calc(100% + 10px)", minWidth: 230 }}
                        >
                          <span aria-hidden className="mr-1.5 inline-flex h-4 w-4 items-center justify-center rounded-[3px] bg-white text-[11px] font-bold text-black">!</span>
                          {issue.description || activeCheck?.title || issue.display_name || issue.rule_id}
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="p-8 text-sm text-[#737373]">No screenshot for this viewport.</div>
              )}
            </div>
          </main>
        </div>
      )}
      {aiIssue && <IssueAIPanel issue={aiIssue} reportSlug={slug} onClose={() => setAiIssue(null)} />}
    </div>
  );
}

function CategorySection({ category, score, scored, checks, onSelect }: {
  category: string; score: number | null; scored: boolean; checks: CheckGroup[];
  onSelect: (c: CheckGroup) => void;
}) {
  const [page, setPage] = useState(1);
  const [viewAll, setViewAll] = useState(false);
  if (checks.length === 0) return null;
  const pageCount = Math.max(1, Math.ceil(checks.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const top = viewAll ? checks : checks.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <section className="mb-7">
      <div className="flex items-center justify-between px-[10px] pb-[9px]">
        <span className="text-[19px] font-semibold leading-6 text-black">{CATEGORY_LABELS[category]}</span>
        {scored ? (
          <div className="flex items-center gap-[6px] text-[16px] font-semibold text-black">
            <InspectorScoreRing score={score} size={25} stroke={3} showValue={false} />
            <span>{score == null ? "—" : Math.round(score)}{score != null && <span className="align-top text-[10px]">%</span>}</span>
          </div>
        ) : null}
      </div>
        <div>
          <div className="overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white py-[3px]">
          {top.map((c) => (
            <Fragment key={c.key}>
            {inspectorSectionLabel(category, c.ruleId) && (
              <div className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-[0.14em] text-[#737373]">{inspectorSectionLabel(category, c.ruleId)}</div>
            )}
            <button onClick={() => onSelect(c)} aria-label={c.title} className="flex min-h-[54px] w-full items-start gap-3 px-[10px] py-[10px] text-left hover:bg-[#f5f5f5]">
              <SevIcon impact={c.worstImpact} />
              <span className="flex-1 text-[14px] font-semibold leading-[20px] text-black">{c.title}</span>
            </button>
            </Fragment>
          ))}
          </div>
          {checks.length > PAGE_SIZE && (
            <div className="flex items-center justify-between gap-3 px-[10px] py-[10px] text-[13px] text-[#525252]">
              {viewAll ? (
                <>
                  <span>Showing all {checks.length}</span>
                  <button
                    type="button"
                    onClick={() => { setViewAll(false); setPage(1); }}
                    className="font-semibold text-black underline"
                  >
                    Show less
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => setPage((p) => Math.max(1, p - 1))}
                    disabled={safePage <= 1}
                    className="font-semibold text-black disabled:opacity-30"
                    aria-label={`Previous ${CATEGORY_LABELS[category]} issues`}
                  >
                    Previous
                  </button>
                  <span>
                    {safePage} / {pageCount}
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setPage((p) => Math.min(pageCount, p + 1))}
                      disabled={safePage >= pageCount}
                      className="font-semibold text-black disabled:opacity-30"
                      aria-label={`Next ${CATEGORY_LABELS[category]} issues`}
                    >
                      Next
                    </button>
                    <button
                      type="button"
                      onClick={() => setViewAll(true)}
                      className="font-semibold text-black underline"
                    >
                      View all
                    </button>
                  </div>
                </>
              )}
            </div>
          )}
        </div>
    </section>
  );
}

function CheckDetail({ check, checkConfig, showFullDesc, setShowFullDesc, reviewed, toggleReviewed, onBack, onFinding, onAskAI, selectedIssueId }: {
  check: CheckGroup; checkConfig: CheckConfig | null;
  showFullDesc: boolean; setShowFullDesc: (v: boolean) => void;
  reviewed: Set<string>; toggleReviewed: (id: string) => void;
  onBack: () => void; onFinding: (i: IssueOut) => void; selectedIssueId: string | null;
  onAskAI: (i: IssueOut) => void;
}) {
  const [page, setPage] = useState(1);
  const threshold = thresholdText(check.ruleId, checkConfig);
  const first = check.issues[0];
  const selectedIndex = Math.max(0, check.issues.findIndex((issue) => issue.id === selectedIssueId));
  const pageCount = Math.max(1, Math.ceil(check.issues.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visibleIssues = check.issues.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-white">
      <div className="px-[7px] pb-4 pt-3">
        <div className="flex items-start gap-[10px]">
          <button onClick={onBack} className="flex h-8 w-8 flex-none items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-white text-[22px] leading-none text-black" aria-label="Back to all issues">‹</button>
          <h2 className="pr-1 text-[20px] font-semibold leading-[22px] text-black">{check.title}</h2>
        </div>
        {check.criterionId && (
          <div className="ml-10 mt-3 text-[14px] font-semibold text-[#737373]">WCAG {check.wcagVersion} {check.wcagLevel} {check.criterionId}</div>
        )}
        <div className="mt-4 text-[14px] leading-[21px] text-[#525252]">
        <p>{first?.remediation || first?.description}</p>
        {(threshold || showFullDesc) && (
          <button onClick={() => setShowFullDesc(!showFullDesc)} className="mt-1 text-[13px] text-black underline">
            {showFullDesc ? "Show less" : "Show more"}
          </button>
        )}
        {showFullDesc && (
          <div className="mt-2 space-y-2 text-xs text-[#737373]">
            {threshold && (
              <p><span className="font-semibold">Threshold: </span>{threshold}</p>
            )}
            <p><span className="font-semibold">Why it matters: </span>{first?.remediation}</p>
          </div>
        )}
        </div>
      </div>

      <div className="border-t-[3px] border-black pt-4">
        <div className="mb-3 text-center text-[14px] font-medium text-black">
          Issues
        </div>
        <ul className="flex flex-col">
          {visibleIssues.map((i) => {
            const isReviewed = reviewed.has(i.id);
            const active = i.id === selectedIssueId;
            return (
              <li key={i.id} className="px-[4px]">
                <button
                  onClick={() => onFinding(i)}
                  className={`flex min-h-[39px] w-full min-w-0 items-center gap-2 px-2 text-left text-[12px] ${active ? "bg-black text-white" : "hover:bg-[#f5f5f5]"} ${isReviewed ? "opacity-50" : ""}`}
                >
                  <span className="text-[14px]">{active ? "✓" : ""}</span>
                  <span className="min-w-0 flex-1">
                    <span className={`block truncate underline ${active ? "text-white" : "text-black"}`}>{occurrenceLabel(i)}</span>
                  </span>
                  {i.manual_review && (
                    <span
                      onClick={(e) => { e.stopPropagation(); toggleReviewed(i.id); }}
                      className={`flex-none rounded-[3px] border px-1 text-[10px] ${active ? "border-white/70 text-white" : "border-[#e5e5e5] text-[#525252]"}`}
                    >
                      {isReviewed ? "✓" : "review"}
                    </span>
                  )}
                </button>
                {active && (
                  <div className="rounded-b-[3px] bg-[#f5f5f5] px-2 py-4">
                    <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-white p-3 font-mono text-[11px] text-black">
                      {i.selector || occurrenceLabel(i)}
                    </div>
                  </div>
                )}
                {active && (
                  <button
                    type="button"
                    onClick={() => onAskAI(i)}
                    className="mx-auto my-3 block rounded-[3px] bg-black px-3 py-2 text-[12px] font-semibold text-white"
                    aria-label={`Ask AI about ${occurrenceLabel(i)}`}
                  >
                    ✦ Ask AI
                  </button>
                )}
              </li>
            );
          })}
        </ul>
        {check.issues.length > PAGE_SIZE && (
          <div className="flex items-center justify-between px-[10px] py-2 text-[13px] text-[#525252]">
            <button type="button" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={safePage <= 1} className="font-semibold text-black disabled:opacity-30">Previous</button>
            <span>{safePage} / {pageCount}</span>
            <button type="button" onClick={() => setPage((p) => Math.min(pageCount, p + 1))} disabled={safePage >= pageCount} className="font-semibold text-black disabled:opacity-30">Next</button>
          </div>
        )}
        {check.issues.length > 0 && (
          <div className="mt-3 flex h-[57px] items-center justify-between bg-[#f5f5f5] px-[10px] text-[13px] text-black">
            <button type="button" disabled={selectedIndex <= 0} onClick={() => onFinding(check.issues[selectedIndex - 1])} className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-white text-[24px] disabled:opacity-40" aria-label="Previous issue">‹</button>
            <span>{selectedIssueId ? selectedIndex + 1 : 0} of {check.issues.length}</span>
            <button type="button" disabled={!selectedIssueId || selectedIndex >= check.issues.length - 1} onClick={() => onFinding(check.issues[selectedIndex + 1])} className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-white text-[24px] disabled:opacity-40" aria-label="Next issue">›</button>
          </div>
        )}
      </div>
    </div>
  );
}

function InfoTab({ report, page }: { report: InstantReportData; page: PageDetail | null }) {
  const rows: [string, string][] = [
    ["Tested URL", report.url],
    ["Final URL", page?.final_url ?? report.url],
    ["HTTP status", page?.status_code != null ? String(page.status_code) : "—"],
    ["Render time", page?.render_ms != null ? `${page.render_ms} ms` : "—"],
    ["Viewports captured", page ? Object.keys(page.screenshots).join(", ") : "—"],
    ["Issues", page ? `${page.issue_count} (+${page.manual_review_count} manual)` : "—"],
    ["Scanned", new Date(report.created_at).toLocaleString()],
    ["Engine", report.engine_version],
  ];
  return (
    <div className="flex-1 overflow-y-auto p-4">
      <h2 className="mb-3 text-sm font-semibold text-black">Page info</h2>
      <dl className="flex flex-col gap-2 text-xs">
        {rows.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-3 border-b border-[#e5e5e5] pb-1.5">
            <dt className="flex-none text-[#737373]">{k}</dt>
            <dd className="min-w-0 truncate text-right text-black">{v}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

function ReportSkeleton() {
  return (
    <div className="light-theme flex h-screen items-center justify-center bg-white">
      <CompassLoader label="Loading report…" size="lg" />
    </div>
  );
}
