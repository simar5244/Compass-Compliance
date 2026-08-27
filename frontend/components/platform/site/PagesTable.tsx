"use client";

import { useEffect, useMemo, useState } from "react";
import type { SitePageRow } from "@/lib/auth";
import { ListPagination, useListPagination } from "@/components/platform/ListPagination";
import { ScoreRing, relativeTime } from "@/components/platform/ui";

export type PagesTableCategory = "all" | "content" | "accessibility" | "marketing" | "ux";
export type PagesTableSort = "issues" | "score" | "reading_age" | "last_changed";

const PAGE_SIZE = 10;

function cmsBadgeLabel(cms: string) {
  // Inventory returns e.g. "WordPress" / "Shopify" / raw generator.
  return cms.split(" ")[0].slice(0, 18);
}

function isLikelyCms(cms: string | null | undefined): boolean {
  if (!cms) return false;
  const low = cms.toLowerCase();
  return low.includes("wordpress") || low.includes("shopify") || low.includes("cms") || low.includes("generator");
}

function readingAgeColor(age: number | null | undefined): string {
  if (age == null) return "var(--text-muted)";
  return "#000000";
}

function truncateMiddle(s: string, max = 64) {
  if (s.length <= max) return s;
  const head = Math.floor(max * 0.6);
  const tail = max - head - 1;
  return `${s.slice(0, head)}…${s.slice(s.length - tail)}`;
}

export function PagesTable({
  siteId,
  scanId,
  pages,
  category,
  onCategoryChange,
  showCategoryFilter = true,
  onInspect,
}: {
  siteId: string;
  scanId: string | null;
  pages: SitePageRow[];
  category: PagesTableCategory;
  onCategoryChange?: (c: PagesTableCategory) => void;
  showCategoryFilter?: boolean;
  onInspect: (pageId: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<PagesTableSort>("issues");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let rows = pages;
    // backend may not supply category_issue_count unless category query param was used.
    // If category != all and counts are missing, we still show all pages and just treat count as 0.
    if (q) {
      rows = rows.filter((p) => {
        const hay = `${p.title ?? ""} ${p.url}`.toLowerCase();
        return hay.includes(q);
      });
    }
    return rows;
  }, [pages, search]);

  const sorted = useMemo(() => {
    const rows = [...filtered];
    rows.sort((a, b) => {
      const ai =
        category !== "all" && a.category_issue_count != null
          ? a.category_issue_count
          : (a.issue_count ?? 0);
      const bi =
        category !== "all" && b.category_issue_count != null
          ? b.category_issue_count
          : (b.issue_count ?? 0);
      const as = a.score ?? -1;
      const bs = b.score ?? -1;
      const ar = a.reading_age ?? -1;
      const br = b.reading_age ?? -1;
      const at = a.last_changed_at ? new Date(a.last_changed_at).getTime() : 0;
      const bt = b.last_changed_at ? new Date(b.last_changed_at).getTime() : 0;
      if (sort === "issues") return bi - ai;
      if (sort === "score") return bs - as;
      if (sort === "reading_age") return br - ar;
      if (sort === "last_changed") return bt - at;
      return 0;
    });
    return rows;
  }, [filtered, sort, category]);

  const [checked, setChecked] = useState<Record<string, boolean>>({});

  const {
    page: safePage,
    setPage,
    viewAll,
    setViewAll,
    pageCount,
    visible,
    showPager,
  } = useListPagination(sorted, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [sort, search, category, setPage]);

  const allChecked = visible.length > 0 && visible.every((p) => checked[p.page_id]);

  function toggleAll() {
    const next = !allChecked;
    const out: Record<string, boolean> = {};
    for (const p of sorted) out[p.page_id] = next;
    setChecked(out);
  }

  function issuesLabel(p: SitePageRow) {
    if (category !== "all" && p.category_issue_count != null) return p.category_issue_count;
    return p.issue_count;
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {showCategoryFilter && (
            <label className="text-xs text-[#737373]">
              Category
              <select
                className="ml-2 rounded-[3px] border border-[#e5e5e5] bg-white px-2 py-1 text-sm text-black outline-none focus:border-black"
                value={category}
                onChange={(e) => onCategoryChange?.(e.target.value as PagesTableCategory)}
              >
                <option value="all">All</option>
                <option value="content">Content</option>
                <option value="accessibility">Accessibility</option>
                <option value="marketing">Marketing</option>
                <option value="ux">User Experience</option>
              </select>
            </label>
          )}

          <label className="text-xs text-[#737373]">
            Sort
            <select
              className="ml-2 rounded-[3px] border border-[#e5e5e5] bg-white px-2 py-1 text-sm text-black outline-none focus:border-black"
              value={sort}
              onChange={(e) => setSort(e.target.value as PagesTableSort)}
            >
              <option value="issues">Most issues</option>
              <option value="score">Highest score</option>
              <option value="reading_age">Highest reading age</option>
              <option value="last_changed">Most recently changed</option>
            </select>
          </label>
        </div>

        <div className="flex items-center gap-2">
          <input
            placeholder="Search pages"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-[240px] rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-2 text-sm text-black outline-none placeholder:text-[#737373] focus:border-black"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-white">
        <table className="w-full text-sm">
          <thead className="bg-[#fafafa]">
            <tr>
              <th className="px-3 py-2 text-left">
                <input type="checkbox" checked={allChecked} onChange={toggleAll} aria-label="Select all pages" />
              </th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#737373]">Inspect</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#737373]">Title / URL</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#737373]">Score</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#737373]">Words</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#737373]">Reading age</th>
              <th className="px-3 py-2 text-left text-xs font-semibold text-[#737373]">Last changed</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#737373]">Issues</th>
              <th className="px-3 py-2 text-right text-xs font-semibold text-[#737373]">Controls</th>
            </tr>
          </thead>
          <tbody>
            {visible.map((p) => {
              const cms = p.cms;
              const cmsBadge = isLikelyCms(cms) ? cmsBadgeLabel(cms!) : null;
              return (
                <tr key={p.page_id} className="border-t border-[#e5e5e5]">
                  <td className="px-3 py-2">
                    <input
                      type="checkbox"
                      checked={!!checked[p.page_id]}
                      onChange={(e) => setChecked((prev) => ({ ...prev, [p.page_id]: e.target.checked }))}
                      aria-label={`Select ${p.url}`}
                    />
                  </td>
                  <td className="px-3 py-2">
                    <button
                      disabled={!scanId}
                      onClick={() => onInspect(p.page_id)}
                      className="text-xs text-black underline disabled:opacity-50"
                      title={scanId ? "Inspect in overlay" : "No scan available"}
                      aria-label={`Inspect ${p.url}`}
                    >
                      🔍
                    </button>
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-black">
                          {p.title || "(untitled)"}
                        </div>
                        <div className="truncate text-xs text-[#737373]" title={p.url}>
                          {truncateMiddle(p.url, 72)}
                        </div>
                      </div>
                      {cmsBadge && (
                        <span
                          className="shrink-0 rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-2 py-0.5 text-[10px] font-semibold text-[#737373]"
                          title={cms ?? undefined}
                        >
                          {cmsBadge}
                        </span>
                      )}
                    </div>
                  </td>
                  <td className="px-3 py-2 text-right"><ScoreRing score={p.score} size={34} stroke={4} /></td>
                  <td className="px-3 py-2 text-right tabular-nums">{p.word_count ?? "—"}</td>
                  <td
                    className="px-3 py-2 text-right tabular-nums"
                    style={{ color: readingAgeColor(p.reading_age) }}
                    data-testid="reading-age"
                  >
                    {p.reading_age == null ? "—" : p.reading_age.toFixed(1)}
                  </td>
                  <td className="px-3 py-2 text-xs text-[#737373]">{relativeTime(p.last_changed_at)}</td>
                  <td className="px-3 py-2 text-right font-semibold tabular-nums">{issuesLabel(p)}</td>
                  <td className="px-3 py-2 text-right">
                    <button
                      className="rounded-[3px] border border-[#e5e5e5] px-2 py-1 text-xs text-[#737373]"
                      aria-label="Controls"
                    >
                      ⋯
                    </button>
                  </td>
                </tr>
              );
            })}
            {sorted.length === 0 && (
              <tr>
                <td colSpan={9} className="px-4 py-8 text-center text-sm text-[#737373]">
                  No pages found.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {showPager && (
        <ListPagination
          className="mt-3"
          page={safePage}
          pageCount={pageCount}
          onPage={setPage}
          viewAll={viewAll}
          onViewAllChange={setViewAll}
          totalItems={sorted.length}
        />
      )}

      <div className="mt-2 text-xs text-[#737373]">
        Showing {visible.length} of {sorted.length} pages
      </div>
    </div>
  );
}
