"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search } from "lucide-react";

import { GrammarIssuesTable } from "@/components/platform/site/GrammarIssuesTable";
import { getGrammarIssues, type GrammarGroup, type GrammarIssuesResponse } from "@/lib/api";
import { type AffectedPage } from "@/components/platform/site/AffectedPagesTab";

const TABS = ["Issues", "Instances", "Pages"] as const;
type TabKey = (typeof TABS)[number];
const PAGE_SIZE = 10;

const INTRO =
  "Potential grammar errors are highlighted here. Review each one and either correct it on the page " +
  "or mark it as approved so it is no longer flagged. Grammar is checked sentence by sentence across " +
  "every page, so the same phrasing repeated in a shared header or footer is reported once per page it " +
  "appears on. Spelling is handled by its own check and is not repeated here.";

function Pagination({
  pageCount,
  current,
  onPage,
}: {
  pageCount: number;
  current: number;
  onPage: (index: number) => void;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1 border-t border-[#e5e5e5] py-4">
      {Array.from({ length: pageCount }).map((_, index) => (
        <button
          key={index}
          type="button"
          onClick={() => onPage(index)}
          aria-current={index === current ? "page" : undefined}
          className={`h-8 min-w-8 px-2 text-[13px] font-medium rounded-[3px] ${
            index === current
              ? "border border-black bg-black text-white"
              : "border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa]"
          }`}
        >
          {index + 1}
        </button>
      ))}
    </nav>
  );
}

export default function ContentGrammarPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [tab, setTab] = useState<TabKey>("Issues");
  const [data, setData] = useState<GrammarIssuesResponse | null>(null);
  const [page, setPage] = useState(0);

  const load = useCallback(() => {
    getGrammarIssues(params.id)
      .then(setData)
      .catch(() => setData({ total_issue_count: 0, lang_codes_detected: [], groups: [] }));
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  const allIssues = useMemo(
    () =>
      (data?.groups ?? []).flatMap((group) =>
        group.issues.map((issue) => ({ ...issue, group: group.group_name, severity: group.severity })),
      ),
    [data],
  );

  /** One row per page, counting every flagged occurrence on it. */
  const affectedPages = useMemo(() => {
    const byPage = new Map<string, AffectedPage & { scan_id: string }>();
    for (const issue of allIssues) {
      const existing = byPage.get(issue.page_id);
      if (existing) existing.count += issue.quantity;
      else
        byPage.set(issue.page_id, {
          page_id: issue.page_id,
          page_url: issue.page_url,
          count: issue.quantity,
          issue_id: issue.id,
          scan_id: issue.scan_id,
        });
    }
    return [...byPage.values()].sort((a, b) => b.count - a.count);
  }, [allIssues]);

  const issuePageCount = Math.max(1, Math.ceil(allIssues.length / PAGE_SIZE));
  const issueCurrent = Math.min(page, issuePageCount - 1);

  const pagedGroups = useMemo((): GrammarGroup[] => {
    const start = issueCurrent * PAGE_SIZE;
    const slice = allIssues.slice(start, start + PAGE_SIZE);
    const order: string[] = [];
    const map = new Map<string, GrammarGroup>();
    for (const issue of slice) {
      if (!map.has(issue.group)) {
        order.push(issue.group);
        map.set(issue.group, {
          group_name: issue.group,
          severity: issue.severity === "error" ? "error" : "warning",
          rule_ids: [],
          issues: [],
        });
      }
      map.get(issue.group)!.issues.push({
        id: issue.id,
        rule_id: issue.rule_id,
        excerpt: issue.excerpt,
        corrected_excerpt: issue.corrected_excerpt,
        error_text: issue.error_text,
        replacement: issue.replacement,
        source_type: issue.source_type,
        page_url: issue.page_url,
        page_id: issue.page_id,
        scan_id: issue.scan_id,
        quantity: issue.quantity,
      });
    }
    return order.map((key) => map.get(key)!);
  }, [allIssues, issueCurrent]);

  function inspect(scanId: string, pageId: string, issueId?: string) {
    const from = `/sites/${params.id}/content/grammar`;
    const issue = issueId ? `&issue=${issueId}` : "";
    router.push(`/scans/${scanId}/inspect?page=${pageId}${issue}&from=${encodeURIComponent(from)}`);
  }

  const languages = data?.lang_codes_detected ?? [];

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Content</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">Review potential grammar errors</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">
          {languages.length ? `${INTRO} Detected language: ${languages.join(", ")}.` : INTRO}
        </p>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Issues</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {(data?.total_issue_count ?? 0).toLocaleString("en-US")}
            </p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Groups</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{data?.groups.length ?? 0}</p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Pages</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{affectedPages.length}</p>
          </div>
        </div>
      </header>

      <section className="px-6 py-8 lg:px-12">
        <div className="mb-4 flex gap-1 border-b border-[#e5e5e5]">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => { setTab(item); setPage(0); }}
              aria-current={tab === item ? "page" : undefined}
              className={`-mb-px border-b-2 px-4 py-3 text-sm font-medium ${
                tab === item
                  ? "border-black text-black"
                  : "border-transparent text-[#737373] hover:text-black"
              }`}
            >
              {item}
            </button>
          ))}
        </div>

        {tab === "Issues" && (
          <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
            <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
              <h2 className="text-lg font-semibold text-black">Issues</h2>
              <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
                {data?.total_issue_count ?? 0}
              </span>
            </div>
            {data ? (
              <div className="p-5">
                <GrammarIssuesTable
                  groups={pagedGroups}
                  siteId={params.id}
                  onChanged={load}
                  onInspect={(issue) => inspect(issue.scan_id, issue.page_id, issue.id)}
                />
                <Pagination pageCount={issuePageCount} current={issueCurrent} onPage={setPage} />
              </div>
            ) : (
              <div className="py-10"><CompassLoader label="Loading grammar results…" /></div>
            )}
          </div>
        )}

        {tab === "Instances" && (
          <InstancesTab issues={allIssues} pagesCount={affectedPages.length} onInspect={inspect} />
        )}

        {tab === "Pages" && (
          <PagesPanel
            pages={affectedPages}
            countLabel="Issues"
            onInspect={(pageRow) => {
              const match = affectedPages.find((row) => row.page_id === pageRow.page_id);
              if (match) inspect(match.scan_id, match.page_id, match.issue_id);
            }}
          />
        )}
      </section>
    </div>
  );
}

function InstancesTab({
  issues,
  pagesCount,
  onInspect,
}: {
  issues: {
    id: string;
    excerpt: string;
    error_text: string;
    quantity: number;
    group: string;
    severity: string;
    scan_id: string;
    page_id: string;
    page_url: string;
  }[];
  pagesCount: number;
  onInspect: (scanId: string, pageId: string, issueId?: string) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(issues.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = issues.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  if (issues.length === 0) {
    return (
      <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
        <p className="px-5 py-10 text-center text-sm text-[#737373]">No instances.</p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
      <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
        <h2 className="text-lg font-semibold">Instances</h2>
        <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
          {issues.length}
        </span>
        <p className="ml-auto text-[13px] text-[#737373]">
          {issues.length} {issues.length === 1 ? "instance" : "instances"} across {pagesCount}{" "}
          {pagesCount === 1 ? "page" : "pages"}
        </p>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
            <th scope="col" className="w-[52px]" />
            <th scope="col" className="px-3 py-3 font-medium">Text</th>
            <th scope="col" className="px-3 py-3 font-medium">Page</th>
            <th scope="col" className="w-[110px] py-3 pl-3 pr-5 text-right font-medium">Quantity</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((issue) => (
            <tr key={issue.id} className="border-b border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
              <td className="py-3 pl-5 align-top">
                <button
                  type="button"
                  onClick={() => onInspect(issue.scan_id, issue.page_id, issue.id)}
                  aria-label={`Inspect ${issue.error_text || issue.excerpt}`}
                  className="grid h-8 w-8 place-items-center rounded-[3px] bg-black text-white hover:bg-[#262626]"
                >
                  <Search aria-hidden className="h-4 w-4" />
                </button>
              </td>
              <td className="px-3 py-3">
                <span className="text-[14px] text-black">{issue.excerpt}</span>
                <span className="mt-0.5 block text-[13px] text-[#737373]">{issue.group}</span>
              </td>
              <td className="max-w-0 truncate px-3 py-3 text-[14px] text-[#525252]" title={issue.page_url}>
                {issue.page_url}
              </td>
              <td className="py-3 pl-3 pr-5 text-right text-[14px] tabular-nums text-[#525252]">{issue.quantity}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <Pagination pageCount={pageCount} current={current} onPage={setPage} />
    </div>
  );
}

function PagesPanel({
  pages,
  countLabel,
  onInspect,
}: {
  pages: (AffectedPage & { scan_id?: string })[];
  countLabel: string;
  onInspect: (page: AffectedPage) => void;
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(pages.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = pages.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
      <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
        <h2 className="text-lg font-semibold">Pages</h2>
        <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
          {pages.length}
        </span>
      </div>
      {pages.length === 0 ? (
        <p className="px-5 py-10 text-center text-sm text-[#737373]">No affected pages.</p>
      ) : (
        <>
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
                <th scope="col" className="w-[52px]" />
                <th scope="col" className="px-3 py-3 font-medium">Page</th>
                <th scope="col" className="w-[140px] py-3 pl-3 pr-5 text-right font-medium">{countLabel}</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.page_id} className="border-b border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
                  <td className="py-3 pl-5">
                    <button
                      type="button"
                      onClick={() => onInspect(row)}
                      aria-label={`Inspect ${row.page_url}`}
                      className="grid h-8 w-8 place-items-center bg-black text-white hover:bg-[#262626] rounded-[3px]"
                    >
                      <Search aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="max-w-0 truncate px-3 py-3">
                    <button
                      type="button"
                      onClick={() => onInspect(row)}
                      className="block max-w-full truncate text-[14px] text-black underline decoration-[#737373] underline-offset-2 hover:decoration-black"
                      title={row.page_url}
                    >
                      {row.page_url}
                    </button>
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right text-[14px] tabular-nums text-[#525252]">{row.count}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination pageCount={pageCount} current={current} onPage={setPage} />
        </>
      )}
    </div>
  );
}
