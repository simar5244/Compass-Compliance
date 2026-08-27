"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, Check } from "lucide-react";

import { ignoreIssues, type ExposedValue } from "@/lib/auth";
import { CheckDetailShell } from "@/components/platform/site/CheckDetailShell";
import { AffectedPagesTab, rollUpPages, type AffectedPage } from "@/components/platform/site/AffectedPagesTab";

export type ValueColumn<T> = {
  header: string;
  width: string;
  render: (row: T) => React.ReactNode;
};

/**
 * A privacy check that lists the values it found — phone numbers, email
 * addresses — with where each appears and a control to approve it. Approving
 * marks that value's findings reviewed, so it drops off the list.
 */
export function ExposedValuesScreen<T extends ExposedValue>({
  checkId,
  title,
  intro,
  valueTabLabel,
  valueHeader,
  approveLabel,
  href,
  load,
  linkFor,
  displayValue,
  columns,
}: {
  checkId: string;
  title: string;
  intro: string;
  /** Name of the first tab, e.g. "Phone numbers". */
  valueTabLabel: string;
  valueHeader: string;
  approveLabel: string;
  /** This screen's own path, so the inspector can return to it. */
  href: string;
  load: (siteId: string) => Promise<{ scan_id: string | null; rows: T[] }>;
  /** Where the value itself links, e.g. a tel: or mailto: URL. */
  linkFor: (row: T) => string;
  displayValue: (row: T) => string;
  columns: ValueColumn<T>[];
}) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requestKey = params.id;
  const [tab, setTab] = useState<string>(valueTabLabel);
  const [approved, setApproved] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState<{
    key: string;
    scanId: string | null;
    rows: T[] | null;
    error: string | null;
  }>({ key: "", scanId: null, rows: null, error: null });

  useEffect(() => {
    let cancelled = false;
    load(params.id)
      .then((r) => {
        if (!cancelled) setLoaded({ key: requestKey, scanId: r.scan_id, rows: r.rows, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, scanId: null, rows: null,
            error: e instanceof Error ? e.message : `Failed to load ${valueTabLabel.toLowerCase()}`,
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey, load, valueTabLabel]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const rows = useMemo(
    () => (fresh?.rows ?? []).filter((row) => !approved.has(row.value)),
    [fresh, approved],
  );
  const error = fresh?.error ?? null;
  const affectedPages = useMemo(
    () =>
      rollUpPages(
        rows.flatMap((row) =>
          row.pages.map((page, index) => ({ ...page, issue_id: row.issue_ids[index] })),
        ),
      ),
    [rows],
  );

  async function approve(row: T) {
    setApproved((previous) => new Set(previous).add(row.value));
    try {
      await ignoreIssues(params.id, row.issue_ids);
    } catch {
      // Put it back if the server rejected the change.
      setApproved((previous) => {
        const next = new Set(previous);
        next.delete(row.value);
        return next;
      });
    }
  }

  // `value` tells the inspector which of the page's exposed values to outline;
  // the underlying issue covers every value found on that page.
  function inspect(pageId: string, issueId?: string, value?: string) {
    if (!fresh?.scanId || !pageId) return;
    const issue = issueId ? `&issue=${issueId}` : "";
    const picked = value ? `&value=${encodeURIComponent(value)}` : "";
    router.push(
      `/scans/${fresh.scanId}/inspect?page=${pageId}${issue}${picked}&from=${encodeURIComponent(href)}`,
    );
  }

  if (error) {
    return (
      <div className="bg-white p-8 text-sm text-[#737373]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!fresh?.rows) {
    return <CompassLoader fullPage label={`Loading ${valueTabLabel.toLowerCase()}…`} />;
  }

  return (
    <CheckDetailShell
      checkId={checkId}
      title={title}
      intro={intro}
      assisted
      issuesFound={rows.length}
      tabs={[valueTabLabel, "Pages"]}
      activeTab={tab}
      onTabChange={setTab}
    >
      {tab === "Pages" ? (
        <AffectedPagesTab
          pages={affectedPages}
          countLabel={valueTabLabel}
          // The Pages tab rolls up every value on a page, so there is no single one
          // to outline; the issue's own position (its first hit) is used instead.
          onInspect={(page: AffectedPage) => inspect(page.page_id, page.issue_id)}
        />
      ) : (
        <section className="border border-[#e5e5e5] bg-white rounded-[3px]">
          <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
            <h2 className="text-lg font-semibold text-black">Issues</h2>
            <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
              {rows.length}
            </span>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
                <th scope="col" className="w-[52px]" />
                <th scope="col" className="px-3 py-3 font-medium">{valueHeader}</th>
                {columns.map((column) => (
                  <th key={column.header} scope="col" className={`${column.width} px-3 py-3 font-medium`}>
                    {column.header}
                  </th>
                ))}
                <th scope="col" className="w-[90px] px-3 py-3 text-right font-medium">Quantity</th>
                <th scope="col" className="w-[170px] py-3 pl-3 pr-5 text-right font-medium">Controls</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.value} className="border-b border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
                  <td className="py-3 pl-5">
                    <button
                      type="button"
                      onClick={() => inspect(row.pages[0]?.page_id ?? "", row.issue_ids[0], row.value)}
                      disabled={row.pages.length === 0}
                      aria-label={`Inspect ${displayValue(row)}`}
                      className="grid h-8 w-8 place-items-center border border-black bg-black text-white hover:bg-[#262626] disabled:border-[#e5e5e5] disabled:bg-[#f5f5f5] disabled:text-[#a3a3a3] rounded-[3px]"
                    >
                      <Search aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <a
                      href={linkFor(row)}
                      className="text-[14px] font-medium text-black underline underline-offset-2 hover:text-[#525252]"
                    >
                      {displayValue(row)}
                    </a>
                  </td>
                  {columns.map((column) => (
                    <td key={column.header} className="px-3 py-3 text-[14px] text-[#525252]">
                      {column.render(row)}
                    </td>
                  ))}
                  <td className="px-3 py-3 text-right text-[14px] tabular-nums text-[#525252]">
                    {row.quantity}
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => void approve(row)}
                      className="inline-flex items-center gap-1.5 border border-black bg-black px-3 py-2 text-[13px] font-semibold text-white hover:bg-[#262626] rounded-[3px]"
                    >
                      <Check aria-hidden className="h-3.5 w-3.5" /> {approveLabel}
                    </button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={columns.length + 4} className="px-5 py-10 text-center text-sm text-[#737373]">
                    Nothing left to review.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      )}
    </CheckDetailShell>
  );
}
