"use client";

import { useEffect, useMemo, useState } from "react";
import type { SiteCheckRow } from "@/lib/auth";
import { ListPagination, useListPagination } from "@/components/platform/ListPagination";
import { SeverityIcon, type SeverityLevel } from "@/components/platform/site/SeverityIcon";
import { ProgressBar } from "@/components/platform/site/ProgressBar";
import { WCAGBadge } from "@/components/platform/site/WCAGBadge";
import { ScoreRing } from "@/components/platform/ui";

type SortKey = "severity" | "name" | "issues" | "score";
type StatusFilter = "all" | "open";

const PAGE_SIZE = 10;

function categoryBadge(category: string) {
  const key = String(category || "").toLowerCase();
  const base =
    key === "content"
      ? { label: "Content" }
      : key === "accessibility"
      ? { label: "Accessibility" }
      : key === "marketing"
      ? { label: "Marketing" }
      : key === "ux" || key === "user-experience" || key === "user_experience"
      ? { label: "User experience" }
      : { label: category };

  return (
    <span className="inline-flex items-center rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-semibold text-[#525252]">
      {base.label}
    </span>
  );
}

function severityLevel(row: SiteCheckRow): SeverityLevel {
  if (row.assisted) return "assisted";
  const imp = row.severity;
  if (imp === "critical" || imp === "serious") return "error";
  if (imp === "moderate") return "warning";
  if (imp === "minor") return "info";
  return "info";
}

function severityRank(row: SiteCheckRow): number {
  const imp = row.severity;
  return imp === "critical"
    ? 0
    : imp === "serious"
    ? 1
    : imp === "moderate"
    ? 2
    : imp === "minor"
    ? 3
    : 4;
}

function completenessRank(row: SiteCheckRow): number {
  const hasScore = row.check_score != null;
  const hasProgress = row.progress != null;
  if (hasScore && hasProgress) return 0;
  if (hasScore || hasProgress) return 1;
  return 2;
}

export function ChecksTable({
  siteId,
  checks,
  onRowClick,
}: {
  siteId: string;
  checks: SiteCheckRow[];
  onRowClick?: (checkId: string) => void;
}) {
  const [sortKey, setSortKey] = useState<SortKey>("severity");
  const [dir, setDir] = useState<"asc" | "desc">("desc");
  const [status, setStatus] = useState<StatusFilter>("all");

  const rows = useMemo(() => {
    const list = checks.filter((c) => status === "all" || (c.issues ?? 0) > 0);
    const mul = dir === "asc" ? 1 : -1;
    list.sort((a, b) => {
      const completeness = completenessRank(a) - completenessRank(b);
      if (completeness !== 0) return completeness;
      if (sortKey === "severity") return mul * (severityRank(a) - severityRank(b) || ((b.issues ?? 0) - (a.issues ?? 0)));
      if (sortKey === "issues") return mul * ((a.issues ?? -1) - (b.issues ?? -1));
      if (sortKey === "score") return mul * ((a.check_score ?? 0) - (b.check_score ?? 0));
      // name
      return mul * (String(a.criterion_name || a.check_id).localeCompare(String(b.criterion_name || b.check_id)));
    });
    return list;
  }, [checks, sortKey, dir, status]);

  const {
    page: safePage,
    setPage,
    viewAll,
    setViewAll,
    pageCount,
    visible,
    showPager,
  } = useListPagination(rows, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [checks.length, sortKey, dir, status, setPage]);

  function toggleSort(key: SortKey) {
    if (sortKey === key) setDir((d) => (d === "asc" ? "desc" : "asc"));
    else {
      setSortKey(key);
      setDir(key === "name" ? "asc" : "desc");
    }
  }

  const th = (label: string, key: SortKey, right = false) => (
    <th
      className={`px-3 py-2 text-xs font-semibold text-[#737373] ${right ? "text-right" : "text-left"}`}
    >
      <button
        type="button"
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 ${right ? "ml-auto" : ""}`}
        aria-label={`Sort by ${label}`}
      >
        <span>{label}</span>
        {sortKey === key && <span aria-hidden>{dir === "asc" ? "▲" : "▼"}</span>}
      </button>
    </th>
  );

  return (
    <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-white">
      <div className="flex items-center justify-between border-b border-[#e5e5e5] px-4 py-3">
        <div className="flex gap-1 rounded-[3px] bg-[#f5f5f5] p-1">
          {(["all", "open"] as const).map((filter) => (
            <button type="button" key={filter} onClick={() => setStatus(filter)} className={`rounded-[3px] px-3 py-1 text-xs font-semibold capitalize ${status === filter ? "bg-white text-black" : "text-[#737373]"}`}>
              {filter === "all" ? "All" : "Open"}
            </button>
          ))}
        </div>
        <span className="text-xs text-[#737373]">{rows.length} checks</span>
      </div>
      <div>
      <table className="w-full text-sm">
        <thead className="sticky top-0 z-10 bg-[#fafafa]">
          <tr>
            <th className="w-10 px-3 py-2">
              <input type="checkbox" aria-label="Select all" disabled />
            </th>
            <th className="w-10 px-3 py-2" />
            {th("Check", "name")}
            {th("Issues", "issues", true)}
            {th("Score", "score", true)}
            <th className="px-3 py-2 text-xs font-semibold text-[#737373]">Progress</th>
          </tr>
        </thead>
        <tbody>
          {visible.map((c) => {
            const name = c.display_name || c.criterion_name || c.check_id;
            const passing = c.issues === 0;
            return (
              <tr
                key={c.check_id}
                className="platform-table-row"
                style={{ borderLeft: passing ? "3px solid #000000" : "3px solid transparent" }}
              >
                <td className="w-10 px-3 py-3 align-middle text-center">
                  <input type="checkbox" aria-label={`Select ${name}`} disabled />
                </td>
                <td className="px-3 py-3 align-middle">
                  <SeverityIcon level={severityLevel(c)} />
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => onRowClick?.(c.check_id)}
                    className="group text-left"
                  >
                    <div className="font-semibold text-black">{name}</div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-2">
                      {categoryBadge(c.category)}
                      <code className="text-[11px] text-[#737373]">{c.check_id}</code>
                      <WCAGBadge version={c.wcag_version} level={c.wcag_level} criterionId={c.criterion_id} />
                      {c.subcategory && (
                        <span className="text-[11px] text-[#737373]">{c.subcategory}</span>
                      )}
                    </div>
                  </button>
                </td>
                <td
                  className="px-3 py-3 text-right font-semibold tabular-nums text-black"
                >
                  {c.issues == null ? "—" : c.issues}
                </td>
                <td className="px-3 py-3 text-right">
                  <span className="inline-flex items-center justify-end gap-2">
                    <ScoreRing score={c.check_score ?? null} size={32} stroke={3} />
                  </span>
                </td>
                <td className="px-3 py-3">
                  <ProgressBar value={c.progress} />
                </td>
              </tr>
            );
          })}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="px-4 py-6 text-center text-sm text-[#737373]">
                No checks yet. Run a scan to populate this table.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>
      {showPager && (
        <ListPagination
          className="border-t border-[#e5e5e5] px-4 py-3"
          page={safePage}
          pageCount={pageCount}
          onPage={setPage}
          viewAll={viewAll}
          onViewAllChange={setViewAll}
          totalItems={rows.length}
        />
      )}
    </div>
  );
}
