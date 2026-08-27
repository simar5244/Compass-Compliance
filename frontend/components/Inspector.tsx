"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  artifactUrl,
  createRetest,
  getPageDetail,
  getRetestJob,
  ignoreIssue,
  reviewIssue,
  type IssueOut,
  type PageDetail,
  type RetestJob,
} from "@/lib/api";
import { InspectorDetailPanel } from "@/components/inspector/InspectorDetailPanel";
import {
  InspectorSidebar,
  type CheckSeverity,
  type InspectorCheckGroup,
} from "@/components/inspector/InspectorSidebar";
import {
  ACCESSIBILITY_CHECKS, MARKETING_CHECKS, UX_CHECKS, PRIVACY_CHECKS, POLICIES_CHECKS,
  accessibilityCheckRank, accessibilityCheckRuleId, contentCheckRank,
  inspectorCheckTitle, marketingCheckRank, uxCheckRank, privacyCheckRank, policiesCheckRank, policiesCheckTitle,
} from "@/lib/report";

const VIEWPORT_LABELS: Record<string, string> = { desktop: "Desktop", mobile: "Mobile", narrow: "Reflow 320" };
const RETEST_STATES = ["queued", "rendering", "auditing", "finalizing", "done"];

function isBrokenLinkIssue(issue: Pick<IssueOut, "rule_id" | "category" | "subcategory">): boolean {
  if ((issue.rule_id || "").toLowerCase().includes("broken")) return true;
  return issue.category === "content" && (issue.subcategory || "").toLowerCase().includes("link");
}

function issueColor(issue: Pick<IssueOut, "impact" | "manual_review">): string {
  if (issue.manual_review) return "#525252";
  if (issue.impact === "critical" || issue.impact === "serious") return "#000000";
  if (issue.impact === "moderate") return "#525252";
  return "#737373";
}


/**
 * Exposed phone numbers and email addresses are reported as one issue per page
 * covering every value found, so the issue's own box points at the first hit.
 * When the reader came from a list and picked a specific value, swap in that
 * value's position so the outline lands on the one they asked about.
 */
function applyValuePosition(page: PageDetail, value?: string | null): PageDetail {
  const wanted = (value || "").trim();
  if (!wanted) return page;
  return {
    ...page,
    issues: page.issues.map((issue) => {
      if (!issue.html_snippet) return issue;
      try {
        const payload = JSON.parse(issue.html_snippet);
        const box = payload?.positions?.[wanted];
        if (!box) return issue;
        return { ...issue, bbox: box };
      } catch {
        // Not a JSON payload, or no positions recorded — leave it alone.
        return issue;
      }
    }),
  };
}

export function Inspector({
  scanId,
  pageId,
  focusIssueId,
  focusValue,
  returnTo,
}: {
  scanId: string;
  pageId: string;
  focusIssueId?: string | null;
  /** A specific exposed phone number / email address to outline on the page. */
  focusValue?: string | null;
  returnTo?: string | null;
}) {
  const router = useRouter();
  const [page, setPage] = useState<PageDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [viewport, setViewport] = useState<string>("desktop");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pulseId, setPulseId] = useState<string | null>(null);
  const [retest, setRetest] = useState<RetestJob | null>(null);
  const [aiIssue, setAiIssue] = useState<IssueOut | null>(null);
  const [imgFailed, setImgFailed] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(new Set());
  const [sidebarTab, setSidebarTab] = useState<"issues" | "info">("issues");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  // Sidebar width is draggable. The screenshot pane is flex-1, so it takes
  // whatever is left over and re-fits automatically.
  const SIDEBAR_MIN = 240;
  const SIDEBAR_MAX = 720;
  const SIDEBAR_DEFAULT = 382;
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT);
  const draggingRef = useRef(false);

  // Restore the reader's last width. Storage can throw (private windows,
  // blocked site data), and a missing value is fine — fall back to the default.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem("inspector:sidebarWidth"));
      if (Number.isFinite(saved) && saved >= SIDEBAR_MIN && saved <= SIDEBAR_MAX) {
        setSidebarWidth(saved);
      }
    } catch {
      /* no stored preference */
    }
  }, []);

  const clampWidth = useCallback(
    (value: number) => Math.min(SIDEBAR_MAX, Math.max(SIDEBAR_MIN, Math.round(value))),
    [],
  );

  const persistWidth = useCallback((value: number) => {
    try {
      window.localStorage.setItem("inspector:sidebarWidth", String(value));
    } catch {
      /* not persisting is harmless */
    }
  }, []);

  const startResize = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      event.preventDefault();
      draggingRef.current = true;
      const startX = event.clientX;
      const startWidth = sidebarWidth;

      const onMove = (moveEvent: PointerEvent) => {
        if (!draggingRef.current) return;
        setSidebarWidth(clampWidth(startWidth + (moveEvent.clientX - startX)));
      };
      const onUp = () => {
        draggingRef.current = false;
        window.removeEventListener("pointermove", onMove);
        window.removeEventListener("pointerup", onUp);
        // Read the committed value rather than the stale closure copy.
        setSidebarWidth((current) => {
          persistWidth(current);
          return current;
        });
      };
      window.addEventListener("pointermove", onMove);
      window.addEventListener("pointerup", onUp);
    },
    [sidebarWidth, clampWidth, persistWidth],
  );

  // Keyboard equivalent: the handle is focusable, so the panel can be resized
  // without a pointer.
  const resizeByKey = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      const step = event.shiftKey ? 48 : 16;
      let next: number | null = null;
      if (event.key === "ArrowLeft") next = sidebarWidth - step;
      else if (event.key === "ArrowRight") next = sidebarWidth + step;
      else if (event.key === "Home") next = SIDEBAR_DEFAULT;
      if (next === null) return;
      event.preventDefault();
      const clamped = clampWidth(next);
      setSidebarWidth(clamped);
      persistWidth(clamped);
    },
    [sidebarWidth, clampWidth, persistWidth],
  );

  const collapseSidebarOnPageClick = useCallback(() => {
    setSidebarCollapsed(true);
  }, []);

  const focusId = focusIssueId?.trim() || null;
  // Arriving with a focused issue should land on that issue, not merely on its
  // page. Tracked so the selection is applied once per focused issue, leaving
  // the reader free to click elsewhere afterwards.
  const focusApplied = useRef<string | null>(null);

  const imgRef = useRef<HTMLImageElement | null>(null);
  const shotPaneRef = useRef<HTMLDivElement | null>(null);
  const shotWrapRef = useRef<HTMLDivElement | null>(null);
  const boxRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const [imgWidth, setImgWidth] = useState(0);
  const [imgHeight, setImgHeight] = useState(0);
  const [imgNaturalWidth, setImgNaturalWidth] = useState(0);
  const [imgNaturalHeight, setImgNaturalHeight] = useState(0);

  // The inspector is opened from an issue list (grammar, spelling, broken
  // links, exposed phone numbers, ...) which passes where it came from as
  // `returnTo`. Both "back" affordances have to honour it: dropping the reader
  // into the inspector's own full-page view is a different screen from the one
  // they left, and it loses the list they were working through.
  // Returns false when there is nowhere recorded to go back to.
  const returnToOrigin = useCallback((): boolean => {
    const raw = (returnTo || "").trim();
    if (!raw) return false;
    try {
      const url = new URL(raw, window.location.origin);
      if (url.origin !== window.location.origin) return false;
      router.push(`${url.pathname}${url.search}${url.hash}`);
      return true;
    } catch {
      return false;
    }
  }, [returnTo, router]);

  const load = useCallback(async () => {
    try {
      const p = await getPageDetail(scanId, pageId);
      setPage(applyValuePosition(p, focusValue));
      if (focusId) {
        const focused = p.issues.find((i) => i.id === focusId) ?? null;
        if (focused) {
          if (focused.viewport && p.screenshots[focused.viewport]) setViewport(focused.viewport);
        }
      }
      const vps = Object.keys(p.screenshots);
      if (vps.length && !vps.includes(viewport)) setViewport(vps[0]);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load page");
    }
  }, [scanId, pageId, viewport, focusId, focusValue]);

  useEffect(() => {
    load();
  }, [load]);

  // Select the focused issue once its page has loaded, so the reader arrives
  // with it highlighted rather than having to find it in the list.
  useEffect(() => {
    if (!focusId || !page || focusApplied.current === focusId) return;
    const focused = page.issues.find((issue) => issue.id === focusId);
    if (!focused) return;
    focusApplied.current = focusId;
    setSelectedId(focused.id);
    if (focused.bbox) {
      setPulseId(focused.id);
      const timer = setTimeout(() => setPulseId(null), 1200);
      return () => clearTimeout(timer);
    }
  }, [focusId, page]);

  useEffect(() => {
    setImgFailed(false);
    setImgWidth(0);
    setImgHeight(0);
    setImgNaturalWidth(0);
    setImgNaturalHeight(0);
  }, [viewport, pageId, scanId]);

  // Measure the displayed screenshot width so overlay boxes scale correctly.
  useLayoutEffect(() => {
    const measure = () => {
      setImgWidth(imgRef.current?.clientWidth ?? 0);
      setImgHeight(imgRef.current?.clientHeight ?? 0);
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [page, viewport]);

  const shot = page?.screenshots[viewport];
  const capturedCssHeight =
    shot && shot.css_width && imgNaturalWidth && imgNaturalHeight
      ? (shot.css_width * imgNaturalHeight) / imgNaturalWidth
      : shot?.page_height_px
      ? shot.page_height_px
      : null;
  const scaleX = shot && shot.css_width ? imgWidth / shot.css_width : 1;
  const scaleY = capturedCssHeight ? imgHeight / capturedCssHeight : scaleX;

  const filtered = useMemo(() => {
    const issues = page?.issues ?? [];
    if (focusId) {
      const focused = issues.find((issue) => issue.id === focusId);
      if (!focused) return [];
      return issues.filter(
        (issue) => issue.category === focused.category && issue.rule_id === focused.rule_id,
      );
    }
    return issues;
  }, [page, focusId]);

  const filteredForSidebar = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return filtered;
    return filtered.filter((i) => {
      const displayedRuleId = i.category === "accessibility" ? accessibilityCheckRuleId(i.rule_id) : i.rule_id;
      const configuredTitle = displayedRuleId ? inspectorCheckTitle(i.category, displayedRuleId) : null;
      const check = (configuredTitle || i.display_name || i.criterion_name || i.rule_id || "").toLowerCase();
      return check.includes(q);
    });
  }, [filtered, searchQuery]);
  const selectedIssue = page?.issues.find((i) => i.id === selectedId) ?? null;

  function hasUsableBBox(issue: IssueOut): boolean {
    const b = issue.bbox;
    if (!b) return false;
    return b.width > 0 && b.height > 0;
  }

  function hasHighlightForViewport(issue: IssueOut, vp: string): boolean {
    return hasUsableBBox(issue) && (issue.viewport ?? "desktop") === vp;
  }

  const selectedBoxIssue =
    selectedIssue && hasHighlightForViewport(selectedIssue, viewport)
      ? selectedIssue
      : null;

  function severityForIssue(issue: IssueOut): CheckSeverity {
    if (issue.manual_review) return "manual";
    if (issue.impact === "critical" || issue.impact === "serious") return "error";
    if (issue.impact === "moderate") return "warning";
    return "info";
  }

  const severityRank: Record<CheckSeverity, number> = {
    error: 0,
    warning: 1,
    info: 2,
    manual: 3,
  };

  // Sidebar grouping: one check row per category + rule_id.
  const grouped = useMemo(() => {
    const byCategory = new Map<string, Map<string, IssueOut[]>>();
    for (const issue of filteredForSidebar) {
      const displayedRuleId = issue.category === "accessibility" ? accessibilityCheckRuleId(issue.rule_id) : issue.rule_id;
      if (!displayedRuleId
        || (issue.category === "marketing" && marketingCheckRank(displayedRuleId) === MARKETING_CHECKS.length)
        || (issue.category === "ux" && uxCheckRank(displayedRuleId) === UX_CHECKS.length)
        || (issue.category === "privacy" && privacyCheckRank(displayedRuleId) === PRIVACY_CHECKS.length)
        || (issue.category === "policies" && policiesCheckRank(displayedRuleId) === POLICIES_CHECKS.length)) continue;
      if (!byCategory.has(issue.category)) byCategory.set(issue.category, new Map());
      const checks = byCategory.get(issue.category)!;
      if (!checks.has(displayedRuleId)) checks.set(displayedRuleId, []);
      checks.get(displayedRuleId)!.push(issue);
    }

    const result = new Map<string, InspectorCheckGroup[]>();
    for (const [category, checks] of byCategory) {
      const groups = [...checks.entries()].map(([ruleId, issues]) => {
        const orderedIssues = [...issues].sort(
          (a, b) => severityRank[severityForIssue(a)] - severityRank[severityForIssue(b)],
        );
        const representative = orderedIssues[0];
        return {
          key: `${category}:${ruleId}`,
          category,
          ruleId,
          displayName: inspectorCheckTitle(category, ruleId)
            ?? representative.display_name ?? representative.criterion_name ?? ruleId,
          severity: severityForIssue(representative),
          issues: orderedIssues,
          representative,
        } satisfies InspectorCheckGroup;
      });
      groups.sort((a, b) => {
        if (category === "content") return contentCheckRank(a.ruleId) - contentCheckRank(b.ruleId);
        if (category === "marketing") return marketingCheckRank(a.ruleId) - marketingCheckRank(b.ruleId);
        if (category === "ux") return uxCheckRank(a.ruleId) - uxCheckRank(b.ruleId);
        if (category === "privacy") return privacyCheckRank(a.ruleId) - privacyCheckRank(b.ruleId);
        if (category === "policies") return policiesCheckRank(a.ruleId) - policiesCheckRank(b.ruleId);
        return severityRank[a.severity] - severityRank[b.severity]
          || b.issues.length - a.issues.length
          || a.displayName.localeCompare(b.displayName);
      });
      result.set(category, groups);
    }
    const q = searchQuery.trim().toLowerCase();
    const accessibility = result.get("accessibility") ?? [];
    const byRule = new Map(accessibility.map((check) => [check.ruleId, check]));
    const orderedAccessibility = ACCESSIBILITY_CHECKS
      .filter((definition) => !q || `${definition.title} ${definition.ruleId}`.toLowerCase().includes(q))
      .map((definition) => byRule.get(definition.ruleId) ?? ({
        key: `accessibility:${definition.ruleId}`,
        category: "accessibility",
        ruleId: definition.ruleId,
        displayName: definition.title,
        severity: definition.impact === "serious" ? "error" : definition.impact === "moderate" ? "warning" : "info",
        issues: [],
      } satisfies InspectorCheckGroup));
    if (orderedAccessibility.length) result.set("accessibility", orderedAccessibility);
    else result.delete("accessibility");
    for (const [category, definitions] of [
      ["marketing", MARKETING_CHECKS], ["ux", UX_CHECKS],
      ["privacy", PRIVACY_CHECKS], ["policies", POLICIES_CHECKS],
    ] as const) {
      const existing = result.get(category) ?? [];
      const existingByRule = new Map(existing.map((check) => [check.ruleId, check]));
      const ordered = definitions
        .filter((definition) => !q || `${definition.title} ${definition.ruleId}`.toLowerCase().includes(q))
        .map((definition) => {
          const found = existingByRule.get(definition.ruleId);
          if (found) {
            found.displayName = category === "policies"
              ? policiesCheckTitle(definition.ruleId, definition.title, found.issues.length)
              : definition.title;
            return found;
          }
          return ({
          key: `${category}:${definition.ruleId}`, category, ruleId: definition.ruleId,
          displayName: definition.title,
          severity: definition.impact === "serious" ? "error" : definition.impact === "moderate" ? "warning" : "info",
          issues: [],
          } satisfies InspectorCheckGroup);
        });
      if (ordered.length) result.set(category, ordered);
      else result.delete(category);
    }
    return result;
  }, [filteredForSidebar, searchQuery]);

  const selectedGroup = useMemo(() => {
    if (!selectedIssue || !page) return [];
    return page.issues.filter(
      (issue) =>
        issue.category === selectedIssue.category && (
          issue.category === "accessibility"
            ? accessibilityCheckRuleId(issue.rule_id) === accessibilityCheckRuleId(selectedIssue.rule_id)
            : issue.rule_id === selectedIssue.rule_id
        ),
    );
  }, [page, selectedIssue]);
  const selectedCheckKey = selectedIssue
    ? `${selectedIssue.category}:${selectedIssue.category === "accessibility" ? accessibilityCheckRuleId(selectedIssue.rule_id) : selectedIssue.rule_id}`
    : null;

  const selected = selectedIssue;

  useEffect(() => {
    if (!selectedBoxIssue?.bbox) return;
    if (!shotPaneRef.current || !shotWrapRef.current) return;
    if (!imgWidth || !imgHeight) return;

    const pane = shotPaneRef.current;
    const wrap = shotWrapRef.current;
    const b = selectedBoxIssue.bbox;
    const scaledY = b.y * scaleY;
    const scaledH = Math.max(b.height * scaleY, 4);
    const boxTop = wrap.offsetTop + scaledY;
    const boxBottom = boxTop + scaledH;
    const viewTop = pane.scrollTop;
    const viewBottom = pane.scrollTop + pane.clientHeight;

    if (boxTop >= viewTop && boxBottom <= viewBottom) return;

    pane.scrollTo({
      top: Math.max(0, boxTop - pane.clientHeight / 2 + scaledH / 2),
      behavior: "smooth",
    });
  }, [selectedBoxIssue?.id, viewport, imgWidth, imgHeight, scaleY, selectedBoxIssue?.bbox]);

  function selectIssue(issue: IssueOut) {
    if (selectedId === issue.id) {
      setSelectedId(null);
      setPulseId(null);
      setAiIssue(null);
      return;
    }
    setSelectedId(issue.id);
    if (aiIssue?.id !== issue.id) setAiIssue(null);
    if (issue.bbox) {
      const vp = issue.viewport ?? "desktop";
      if (vp !== viewport && page?.screenshots[vp]) setViewport(vp);
      requestAnimationFrame(() => {
        setPulseId(issue.id);
        setTimeout(() => setPulseId(null), 1200);
      });
    }
  }

  function selectCheck(check: InspectorCheckGroup) {
    if (!check.representative) return;
    if (selectedCheckKey === check.key) {
      setSelectedId(null);
      setPulseId(null);
      setAiIssue(null);
      return;
    }
    selectIssue(check.representative);
  }

  async function toggleReviewed(issue: IssueOut) {
    await reviewIssue(issue.id, !issue.reviewed);
    setPage((p) =>
      p ? { ...p, issues: p.issues.map((i) => (i.id === issue.id ? { ...i, reviewed: !i.reviewed } : i)) } : p
    );
  }

  async function handleIgnore(issue: IssueOut) {
    await ignoreIssue(issue.id);
    const replacement = page?.issues.find(
      (candidate) =>
        candidate.id !== issue.id &&
        candidate.category === issue.category &&
        candidate.rule_id === issue.rule_id,
    );
    setPage((p) => p ? { ...p, issues: p.issues.filter((i) => i.id !== issue.id) } : p);
    if (selectedId === issue.id) setSelectedId(replacement?.id ?? null);
    if (aiIssue?.id === issue.id) setAiIssue(null);
  }

  async function runRetest() {
    if (!page) return;
    const job = await createRetest(scanId, page.url);
    setRetest(job);
    const poll = async () => {
      const j = await getRetestJob(job.id);
      setRetest(j);
      if (j.state === "done") {
        await load();
        setTimeout(() => setRetest(null), 2500);
      } else if (j.state !== "failed") {
        setTimeout(poll, 1500);
      }
    };
    setTimeout(poll, 1200);
  }

  if (error) return <div className="light-theme min-h-screen bg-white p-8 text-black">{error}</div>;
  if (!page) return <div className="light-theme flex min-h-screen items-center justify-center bg-white"><CompassLoader label="Loading inspector…" size="lg" /></div>;

  const viewports = Object.keys(page.screenshots);
  const isPdf = !!page.is_document;
  const pageHeading = page.title?.trim() || (() => {
    try { return new URL(page.url).hostname; } catch { return "Untitled page"; }
  })();

  return (
    // Pinned to the viewport: the inspector is a full-screen shell, and if the
    // document can scroll behind it (a stray wheel, a child scrolling an
    // ancestor) it slides away and leaves a blank strip below.
    <div className="light-theme fixed inset-0 flex flex-col overflow-hidden bg-white text-black">
      <header className="flex h-[60px] flex-none items-center gap-3 bg-black px-[10px] text-white">
        <button
          type="button"
          onClick={() => {
            if (!returnToOrigin()) router.back();
          }}
          className="flex h-8 w-8 flex-none items-center justify-center text-[28px] font-light text-white"
          aria-label="Close inspector"
        >
          ×
        </button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-[15px] font-semibold leading-5 text-white">{pageHeading}</h1>
          <p className="truncate text-[12px] leading-4 text-[#a3a3a3]">▰ <span>{page.url}</span></p>
        </div>
        {retest ? (
          <div className="flex items-center gap-2 text-xs text-[#737373]">
            {RETEST_STATES.map((s) => {
              const idx = RETEST_STATES.indexOf(retest.state);
              const here = RETEST_STATES.indexOf(s);
              const active = retest.state !== "failed" && here <= idx;
              return (
                <span key={s} className={active ? "font-semibold text-white" : "text-[#737373]"}>
                  {s}
                </span>
              );
            })}
          </div>
        ) : (
          <button
            onClick={runRetest}
            className="flex-none rounded-[3px] border border-[#737373] bg-transparent px-4 py-2 text-[13px] font-semibold text-white hover:bg-[#262626]"
          >
            Retest this page
          </button>
        )}
      </header>

      <div className="relative flex min-h-0 flex-1">
        {sidebarCollapsed && (
          <button
            type="button"
            onClick={() => setSidebarCollapsed(false)}
            className="absolute left-0 top-1/2 z-30 -translate-y-1/2 rounded-r-[3px] border border-l-0 border-[#e5e5e5] bg-white px-2 py-3 text-[12px] font-semibold text-black shadow-sm hover:bg-[#fafafa]"
            aria-label="Show issues panel"
          >
            Issues
          </button>
        )}

        {!sidebarCollapsed && (
        <>
        {/* sidebar */}
        <InspectorSidebar
          width={sidebarWidth}
          page={page}
          grouped={grouped}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
          selectedCheckKey={selectedCheckKey}
          onSelectCheck={selectCheck}
          collapsedCategories={collapsedCats}
          onToggleCategory={(category) =>
            setCollapsedCats((previous) => {
              const next = new Set(previous);
              next.has(category) ? next.delete(category) : next.add(category);
              return next;
            })
          }
          activeTab={sidebarTab}
          onTabChange={setSidebarTab}
          hasUsableBBox={hasUsableBBox}
          detailPanel={selected && sidebarTab === "issues" ? (
            <InspectorDetailPanel
              issue={selected}
              displayName={inspectorCheckTitle(
                selected.category,
                selected.category === "accessibility" ? accessibilityCheckRuleId(selected.rule_id) ?? selected.rule_id : selected.rule_id,
              ) ?? undefined}
              instances={selectedGroup}
              severity={severityForIssue(selected)}
              aiOpen={aiIssue?.id === selected.id}
              onSelectInstance={selectIssue}
              onAskAIInstance={(issue) => { selectIssue(issue); setAiIssue(issue); }}
              onReview={(issue) => void toggleReviewed(issue)}
              onIgnore={(issue) => void handleIgnore(issue)}
              onToggleAI={() => setAiIssue((previous) => previous?.id === selected.id ? null : selected)}
              onCloseAI={() => setAiIssue(null)}
              embedded
              onBack={() => {
                if (returnToOrigin()) return;
                setSelectedId(null);
                setPulseId(null);
                setAiIssue(null);
              }}
            />
          ) : undefined}
        />

        {/* drag handle */}
        <div
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize sidebar"
          aria-valuenow={sidebarWidth}
          aria-valuemin={SIDEBAR_MIN}
          aria-valuemax={SIDEBAR_MAX}
          tabIndex={0}
          onPointerDown={startResize}
          onKeyDown={resizeByKey}
          onDoubleClick={() => { setSidebarWidth(SIDEBAR_DEFAULT); persistWidth(SIDEBAR_DEFAULT); }}
          title="Drag to resize — double-click to reset"
          className="group relative w-[5px] flex-none cursor-col-resize bg-[#e5e5e5] transition-colors hover:bg-black focus:bg-black focus:outline-none"
        >
          {/* A 5px strip is a small pointer target; widen the grab area
              without moving the visible divider. */}
          <span aria-hidden className="absolute inset-y-0 -left-1 -right-1" />
        </div>
        </>
        )}

        {/* screenshot pane */}
        <main ref={shotPaneRef} className="flex min-w-0 flex-1 flex-col overflow-auto bg-white">
          <div className="flex min-h-[55px] flex-none items-center gap-2 border-b border-[#e5e5e5] bg-white px-2">
            {viewports.map((vp) => (
              <button
                type="button"
                key={vp}
                onClick={() => setViewport(vp)}
                className={`rounded-[3px] px-4 py-2 text-[13px] font-semibold ${
                  vp === viewport
                    ? "bg-black text-white"
                    : "border border-[#e5e5e5] bg-white text-black hover:bg-[#f5f5f5]"
                }`}
              >
                {VIEWPORT_LABELS[vp] ?? vp}
              </button>
            ))}
          </div>

          {selected && isBrokenLinkIssue(selected) && !selectedBoxIssue?.bbox && shot && !imgFailed && (
            <div
              className="mx-auto mb-3 w-full max-w-4xl rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-4 py-2 text-xs text-[#525252]"
            >
              ⚠️ This broken link could not be pinpointed on the screenshot. Use the link details in the panel → to locate it on the page.
            </div>
          )}

          {isPdf ? (
            <div
              data-testid="pdf-placeholder"
              onClick={collapseSidebarOnPageClick}
              className="mx-auto flex w-full max-w-4xl cursor-pointer flex-col items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] p-10 text-center"
            >
              <div className="mb-3 text-4xl" aria-hidden>
                📄
              </div>
              <div className="text-sm font-semibold text-black">PDF document</div>
              <div className="mt-1 text-xs text-[#737373]">Visual preview not available for PDF documents</div>
              <div className="mt-4 max-w-[34rem] truncate text-xs text-[#737373]" title={page.url}>
                {page.url.split("/").pop() || page.url}
              </div>
              <a
                href={page.url}
                target="_blank"
                rel="noreferrer"
                className="mt-2 text-xs text-black underline"
              >
                Open PDF in new tab
              </a>
            </div>
          ) : shot && !imgFailed ? (
            <div
              ref={shotWrapRef}
              data-testid="screenshot-wrap"
              onClick={collapseSidebarOnPageClick}
              className="relative mx-auto w-full cursor-pointer bg-white"
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                ref={imgRef}
                src={artifactUrl(scanId, shot.ref)}
                alt="Rendered page"
                className="block w-full"
                onLoad={() => {
                  setImgWidth(imgRef.current?.clientWidth ?? 0);
                  setImgHeight(imgRef.current?.clientHeight ?? 0);
                  setImgNaturalWidth(imgRef.current?.naturalWidth ?? 0);
                  setImgNaturalHeight(imgRef.current?.naturalHeight ?? 0);
                }}
                onError={() => setImgFailed(true)}
              />
              {selectedBoxIssue && (() => {
                const issue = selectedBoxIssue;
                const b = issue.bbox!;
                const color = issueColor(issue);
                const checkLabelRaw = issue.criterion_name || issue.rule_id;
                const checkLabel = checkLabelRaw.length > 30 ? `${checkLabelRaw.slice(0, 29)}…` : checkLabelRaw;
                const left = b.x * scaleX;
                const top = b.y * scaleY;
                const width = Math.max(b.width * scaleX, 4);
                const height = Math.max(b.height * scaleY, 4);
                const placeBelow = top < 30;
                return (
                  <div
                    key={issue.id}
                    ref={(el) => {
                      boxRefs.current[issue.id] = el;
                    }}
                    data-testid="issue-bbox"
                    onClick={() => selectIssue(issue)}
                    className="absolute cursor-pointer rounded-[3px]"
                    style={{
                      left,
                      top,
                      width,
                      height,
                      border: `2px solid ${color}`,
                      backgroundColor: `${color}26`,
                      boxShadow: issue.id === pulseId ? `0 0 0 4px ${color}40` : "none",
                      transform: issue.id === pulseId ? "scale(1.03)" : "scale(1)",
                      opacity: 1,
                      transition: "opacity 150ms, box-shadow 150ms, transform 150ms",
                      zIndex: 20,
                    }}
                  >
                    <div
                      data-testid="issue-bbox-label"
                      className="absolute left-0 max-w-[260px] rounded-[3px] px-2 py-0.5 text-[11px] font-semibold text-white"
                      style={{
                        backgroundColor: color,
                        top: placeBelow ? height + 6 : -24,
                      }}
                      title={checkLabelRaw}
                    >
                      {checkLabel}
                    </div>
                  </div>
                );
              })()}
            </div>
          ) : (
            <div
              data-testid="screenshot-placeholder"
              className="mx-auto flex w-full max-w-4xl flex-col items-center justify-center rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] p-10 text-center"
            >
              <div className="mb-3 text-4xl" aria-hidden>
                🖼️
              </div>
              <div className="text-sm font-semibold text-black">Screenshot not available for this page</div>
              <div className="mt-1 text-xs text-[#737373]">Issue details are shown in the sidebar</div>
            </div>
          )}
        </main>

      </div>
    </div>
  );
}
