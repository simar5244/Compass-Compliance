"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Search } from "lucide-react";

import { CheckDetailShell } from "@/components/platform/site/CheckDetailShell";
import { getSiteCheckDetail, ignoreIssues, type SiteCheckDetail } from "@/lib/auth";
import { IssueAIPanel } from "@/components/IssueAIPanel";

const TABS = ["Issues", "Pages"] as const;
type TabKey = (typeof TABS)[number];

const IMPACT_ORDER = ["critical", "serious", "moderate", "minor"] as const;
const PAGE_SIZE = 10;

function worstImpact(values: Array<string | null | undefined>): string | null {
  const set = new Set(values.filter(Boolean) as string[]);
  for (const impact of IMPACT_ORDER) if (set.has(impact)) return impact;
  return null;
}

type IssueRow = SiteCheckDetail["issues"][number] & {
  page_id?: string | null;
};

type PageRef = {
  page_id: string | null;
  page_url: string;
  page_score: number | null;
  issue_id: string;
  viewport: string | null;
  has_bbox: boolean;
};

function TablePager({
  page,
  pageCount,
  onPage,
}: {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[#e5e5e5] px-5 py-3 text-sm">
      <button
        type="button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[7rem] text-center text-[#525252]">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
        className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

export default function SiteCheckDetailPage() {
  const params = useParams<{ id: string; checkId: string }>();
  const router = useRouter();
  const requestKey = `${params.id}:${params.checkId}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    data: SiteCheckDetail | null;
    error: string | null;
  }>({ key: "", data: null, error: null });
  const [tab, setTab] = useState<TabKey>("Issues");
  const [selectedIssueId, setSelectedIssueId] = useState<string | null>(null);
  const [busyGroup, setBusyGroup] = useState<string | null>(null);
  const [issuePage, setIssuePage] = useState(1);
  const [pagesPage, setPagesPage] = useState(1);
  const [aiOpen, setAiOpen] = useState(false);

  useEffect(() => {
    setAiOpen(false);
  }, [selectedIssueId]);

  useEffect(() => {
    let cancelled = false;
    getSiteCheckDetail(params.id, params.checkId)
      .then((r) => { if (!cancelled) setLoaded({ key: requestKey, data: r, error: null }); })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, data: null,
            error: e instanceof Error ? e.message : "Failed to load check",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, params.checkId, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const data = fresh?.data ?? null;
  const error = fresh?.error ?? null;

  /** Mutating helpers edit the loaded payload in place, keeping its key. */
  const setData = (
    update: (current: SiteCheckDetail | null) => SiteCheckDetail | null,
  ) => setLoaded((previous) => ({ ...previous, data: update(previous.data) }));

  /** Instances sharing the same wording are one issue type, listed worst first. */
  const grouped = useMemo(() => {
    if (!data) return [];
    const byTitle = new Map<
      string,
      {
        key: string;
        title: string;
        impact: string | null;
        selectors: Set<string>;
        instances: SiteCheckDetail["issues"];
        pages: Map<string, PageRef>;
      }
    >();

    for (const issue of data.issues as IssueRow[]) {
      const key = (issue.criterion_name || issue.description || issue.rule_id || "").trim() || "(issue)";
      if (!byTitle.has(key)) {
        byTitle.set(key, { key, title: key, impact: null, selectors: new Set(), instances: [], pages: new Map() });
      }
      const group = byTitle.get(key)!;
      group.instances.push(issue);
      group.impact = worstImpact([group.impact, issue.impact]);
      if (issue.selector) group.selectors.add(issue.selector);
      group.pages.set(issue.page_id || issue.page_url || issue.id, {
        page_id: issue.page_id ?? null,
        page_url: issue.page_url,
        page_score: issue.page_score,
        issue_id: issue.id,
        viewport: issue.viewport,
        has_bbox: !!issue.bbox,
      });
    }

    return [...byTitle.values()]
      .map((group) => ({
        ...group,
        pagesAffected: group.pages.size,
        instanceCount: group.instances.length,
        selectorHint: [...group.selectors].slice(0, 2).join(" · "),
        pageList: [...group.pages.values()].sort((a, b) => a.page_url.localeCompare(b.page_url)),
      }))
      .sort(
        (a, b) =>
          b.pagesAffected - a.pagesAffected ||
          b.instanceCount - a.instanceCount ||
          a.title.localeCompare(b.title),
      );
  }, [data]);

  /** One row per page across every issue type of this check. */
  const affectedPages = useMemo(() => {
    const byPage = new Map<string, { page_id: string; page_url: string; count: number; issue_id: string }>();
    for (const issue of (data?.issues ?? []) as IssueRow[]) {
      const id = issue.page_id;
      if (!id) continue;
      const existing = byPage.get(id);
      if (existing) existing.count += 1;
      else byPage.set(id, { page_id: id, page_url: issue.page_url, count: 1, issue_id: issue.id });
    }
    return [...byPage.values()].sort((a, b) => b.count - a.count || a.page_url.localeCompare(b.page_url));
  }, [data]);

  const issuePageCount = Math.max(1, Math.ceil(grouped.length / PAGE_SIZE));
  const safeIssuePage = Math.min(issuePage, issuePageCount);
  const groupedSlice = grouped.slice((safeIssuePage - 1) * PAGE_SIZE, (safeIssuePage - 1) * PAGE_SIZE + PAGE_SIZE);

  const pagesPageCount = Math.max(1, Math.ceil(affectedPages.length / PAGE_SIZE));
  const safePagesPage = Math.min(pagesPage, pagesPageCount);
  const pagesSlice = affectedPages.slice((safePagesPage - 1) * PAGE_SIZE, (safePagesPage - 1) * PAGE_SIZE + PAGE_SIZE);

  if (error) {
    return (
      <div className="light-theme bg-white px-6 py-10 text-black lg:px-12">
        <p className="text-sm text-[#525252]">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="light-theme flex min-h-[12rem] items-center justify-center bg-white px-6 py-10 text-sm text-[#737373]">
        Loading check…
      </div>
    );
  }

  const title = data.check.criterion_name || data.check_id;
  const wcag = [
    data.check.criterion_id,
    data.check.wcag_level && `Level ${data.check.wcag_level}`,
    data.check.wcag_version && `WCAG ${data.check.wcag_version}`,
  ]
    .filter(Boolean)
    .join(" · ");
  const intro = [
    data.check.pages_affected != null
      ? `${data.check.pages_affected} ${data.check.pages_affected === 1 ? "page is" : "pages are"} affected by this check across ${data.check.instances} ${data.check.instances === 1 ? "instance" : "instances"}.`
      : "",
    wcag ? `It maps to ${wcag}.` : "It is a best-practice check with no WCAG criterion.",
  ]
    .filter(Boolean)
    .join(" ");

  const lighthouseDisabled =
    data.check.check_score == null &&
    data.check.category === "ux" &&
    data.check.subcategory === "Web Vitals";
  const selectedIssue = data.issues.find((issue) => issue.id === selectedIssueId) ?? null;

  function inspect(scanId: string, pageId: string, issueId?: string) {
    const from = `/sites/${params.id}/checks/${encodeURIComponent(params.checkId)}`;
    const issue = issueId ? `&issue=${issueId}` : "";
    router.push(`/scans/${scanId}/inspect?page=${pageId}${issue}&from=${encodeURIComponent(from)}`);
  }

  async function ignoreOne(issueId: string) {
    await ignoreIssues(params.id, [issueId]);
    setData((current) =>
      current ? { ...current, issues: current.issues.filter((issue) => issue.id !== issueId) } : current,
    );
    if (selectedIssueId === issueId) setSelectedIssueId(null);
  }

  return (
    <>
      <CheckDetailShell
        checkId={data.check_id}
        title={title}
        intro={intro}
        tabs={TABS}
        activeTab={tab}
        onTabChange={(next) => {
          setTab(next as TabKey);
          setIssuePage(1);
          setPagesPage(1);
        }}
      >
        {lighthouseDisabled && (
          <div className="border-b border-[#e5e5e5] bg-[#fafafa] px-5 py-4">
            <h2 className="text-[15px] font-semibold text-black">Performance scanning is disabled.</h2>
            <p className="mt-1 text-[13px] text-[#525252]">Enable it in Site Settings to run these checks.</p>
          </div>
        )}

        {tab === "Pages" ? (
          <section>
            {pagesSlice.length === 0 ? (
              <p className="px-5 py-10 text-center text-sm text-[#737373]">No affected pages.</p>
            ) : (
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-[#fafafa] text-[13px] text-[#737373]">
                    <th scope="col" className="w-[52px]" />
                    <th scope="col" className="px-3 py-3 font-medium">Page</th>
                    <th scope="col" className="w-[140px] py-3 pl-3 pr-5 text-right font-medium">Issues</th>
                  </tr>
                </thead>
                <tbody>
                  {pagesSlice.map((page) => (
                    <tr key={page.page_id} className="border-t border-[#e5e5e5]">
                      <td className="py-3 pl-5">
                        <button
                          type="button"
                          onClick={() => inspect(data.latest_scan_id, page.page_id, page.issue_id)}
                          aria-label={`Inspect ${page.page_url}`}
                          className="grid h-8 w-8 place-items-center bg-black text-white hover:bg-[#262626]"
                        >
                          <Search aria-hidden className="h-4 w-4" />
                        </button>
                      </td>
                      <td className="max-w-0 truncate px-3 py-3">
                        <button
                          type="button"
                          onClick={() => inspect(data.latest_scan_id, page.page_id, page.issue_id)}
                          className="block max-w-full truncate text-[14px] text-black underline"
                          title={page.page_url}
                        >
                          {page.page_url}
                        </button>
                      </td>
                      <td className="py-3 pl-3 pr-5 text-right text-[14px] tabular-nums text-[#525252]">
                        {page.count}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            <TablePager page={safePagesPage} pageCount={pagesPageCount} onPage={setPagesPage} />
          </section>
        ) : (
          <section>
            <div className="flex flex-wrap items-end justify-between gap-3 px-0 py-5">
              <div>
                <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Findings</p>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-black">Issue types</h2>
              </div>
              <div className="flex items-center gap-2">
                <span className="border border-[#e5e5e5] bg-[#fafafa] px-2.5 py-0.5 text-[12px] font-medium text-[#525252]">
                  {grouped.length}
                </span>
                <span className="text-[13px] text-[#737373]">
                  {data.issues.length} {data.issues.length === 1 ? "instance" : "instances"}
                </span>
              </div>
            </div>

            <table className="w-full border-t border-[#e5e5e5] text-left">
              <thead>
                <tr className="bg-[#fafafa] text-[13px] text-[#737373]">
                  <th scope="col" className="px-5 py-3 font-medium">Issue</th>
                  <th scope="col" className="w-[110px] px-3 py-3 font-medium">Severity</th>
                  <th scope="col" className="w-[130px] px-3 py-3 text-right font-medium">Pages affected</th>
                  <th scope="col" className="w-[110px] px-3 py-3 text-right font-medium">Instances</th>
                  <th scope="col" className="w-[130px] py-3 pl-3 pr-5 text-right font-medium">Controls</th>
                </tr>
              </thead>
              <tbody>
                {groupedSlice.map((group) => (
                  <tr key={group.key} className="border-t border-[#e5e5e5] align-top">
                    <td className="max-w-0 px-5 py-3">
                      <div className="truncate text-[14px] font-medium text-black" title={group.title}>
                        {group.title}
                      </div>
                      <div className="mt-0.5 truncate text-[13px] text-[#737373]">
                        {group.selectorHint || "Page-level issue"}
                      </div>
                      <button
                        type="button"
                        onClick={() => setSelectedIssueId(group.instances[0]?.id ?? null)}
                        className="mt-1.5 text-[13px] text-black underline"
                      >
                        Open details
                      </button>
                      <details className="mt-1.5">
                        <summary className="cursor-pointer text-[13px] text-black underline">
                          View pages
                        </summary>
                        <div className="mt-2 space-y-1.5">
                          {group.pageList.map((page) => (
                            <div
                              key={page.issue_id}
                              className="flex items-center justify-between gap-2 border border-[#e5e5e5] bg-white px-2 py-1.5"
                            >
                              <div className="min-w-0">
                                <a
                                  href={page.page_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="block max-w-[24rem] truncate text-[13px] text-black underline"
                                  title={page.page_url}
                                >
                                  {page.page_url}
                                </a>
                                <div className="mt-0.5 text-[11px] text-[#737373]">
                                  Score {page.page_score ?? "—"} · {page.viewport || "desktop"}
                                  {!page.has_bbox ? " · no pinpoint" : ""}
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => {
                                  if (page.page_id) inspect(data.latest_scan_id, page.page_id, page.issue_id);
                                }}
                                disabled={!page.page_id}
                                aria-label={`Inspect ${page.page_url}`}
                                className="grid h-8 w-8 flex-none place-items-center bg-black text-white hover:bg-[#262626] disabled:opacity-40"
                              >
                                <Search aria-hidden className="h-4 w-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      </details>
                    </td>
                    <td className="px-3 py-3 text-[13px] capitalize text-[#525252]">{group.impact ?? "info"}</td>
                    <td className="px-3 py-3 text-right text-[14px] tabular-nums text-[#525252]">
                      {group.pagesAffected}
                    </td>
                    <td className="px-3 py-3 text-right text-[14px] tabular-nums text-[#525252]">
                      {group.instanceCount}
                    </td>
                    <td className="py-3 pl-3 pr-5 text-right">
                      <button
                        type="button"
                        disabled={busyGroup === group.key}
                        onClick={async () => {
                          setBusyGroup(group.key);
                          try {
                            await ignoreIssues(params.id, group.instances.map((issue) => String(issue.id)));
                            setData((current) =>
                              current
                                ? {
                                    ...current,
                                    issues: current.issues.filter(
                                      (issue) => !group.instances.some((x) => x.id === issue.id),
                                    ),
                                  }
                                : current,
                            );
                            if (selectedIssueId && group.instances.some((x) => x.id === selectedIssueId)) {
                              setSelectedIssueId(null);
                            }
                          } finally {
                            setBusyGroup(null);
                          }
                        }}
                        className="border border-[#e5e5e5] bg-white px-2.5 py-1.5 text-[13px] font-medium text-black hover:bg-[#fafafa] disabled:opacity-50"
                      >
                        Ignore all
                      </button>
                    </td>
                  </tr>
                ))}
                {data.issues.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-[#737373]">
                      No issue instances found.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
            <TablePager page={safeIssuePage} pageCount={issuePageCount} onPage={setIssuePage} />
          </section>
        )}
      </CheckDetailShell>

      {selectedIssue && (
        <aside className="light-theme fixed inset-y-0 right-0 z-40 flex w-[468px] max-w-[92vw] flex-col overflow-hidden border-l border-[#e5e5e5] bg-white text-black">
          <div className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden p-4">
            <div className="mb-4 flex items-start justify-between gap-3 border-b border-[#e5e5e5] pb-3">
              <div className="min-w-0">
                <div className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">
                  Issue details
                </div>
                <h2 className="mt-1 text-[15px] font-semibold text-black">{selectedIssue.description}</h2>
              </div>
              <button
                onClick={() => setSelectedIssueId(null)}
                className="grid h-8 w-8 flex-none place-items-center border border-[#e5e5e5] text-lg leading-none text-[#525252] hover:bg-[#fafafa]"
                aria-label="Close issue details"
              >
                ×
              </button>
            </div>
            <dl className="mb-4 space-y-2 break-words text-[12px] text-[#525252]">
              <div><dt className="inline font-semibold text-black">URL: </dt><dd className="inline">{selectedIssue.page_url}</dd></div>
              <div><dt className="inline font-semibold text-black">Page score: </dt><dd className="inline">{selectedIssue.page_score ?? "—"}</dd></div>
              <div><dt className="inline font-semibold text-black">Severity: </dt><dd className="inline">{selectedIssue.impact ?? "info"}</dd></div>
              <div><dt className="inline font-semibold text-black">Selector: </dt><dd className="inline break-all">{selectedIssue.selector || "Page-level issue"}</dd></div>
            </dl>
            <button
              onClick={() => void ignoreOne(selectedIssue.id)}
              className="mb-4 border border-[#e5e5e5] bg-white px-3 py-2 text-[12px] font-semibold text-black hover:bg-[#fafafa]"
            >
              Ignore this issue
            </button>
            {selectedIssue.html_snippet && (
              <pre className="mb-4 w-full min-w-0 overflow-x-auto whitespace-pre rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-2 font-mono text-[11px] text-[#525252]">
                <code className="whitespace-pre">{selectedIssue.html_snippet}</code>
              </pre>
            )}
          </div>

          {aiOpen ? (
            <div className="relative flex-none border-t border-[#e5e5e5] p-3">
              <IssueAIPanel issue={selectedIssue} inline onClose={() => setAiOpen(false)} />
            </div>
          ) : (
            <div className="flex flex-none justify-end border-t border-[#e5e5e5] p-3">
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-[3px] border border-black bg-black text-[15px] text-white hover:bg-[#262626]"
                aria-label="Ask AI about this issue"
                title="Ask AI"
              >
                ✦
              </button>
            </div>
          )}
        </aside>
      )}
    </>
  );
}
