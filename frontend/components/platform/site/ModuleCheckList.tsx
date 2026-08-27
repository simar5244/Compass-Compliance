"use client";

import { useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, MoreHorizontal } from "lucide-react";

import type { SiteCheckRow } from "@/lib/auth";

const PAGE_SIZE = 10;

/** Assisted checks need a person; the rest are graded by severity. */
function toneOf(row: SiteCheckRow): "assisted" | "error" | "warning" | "info" {
  if (row.assisted) return "assisted";
  if (row.catalog_severity === "error") return "error";
  return row.catalog_severity === "warning" ? "warning" : "info";
}

function completenessRank(row: SiteCheckRow): number {
  const hasScore = row.check_score != null;
  const hasProgress = row.progress != null;
  if (hasScore && hasProgress) return 0;
  if (hasScore || hasProgress) return 1;
  return 2;
}

export function CheckIcon({ tone }: { tone: ReturnType<typeof toneOf> }) {
  if (tone === "error") {
    return (
      <span aria-hidden className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-black text-[13px] font-bold leading-none text-white">
        !
      </span>
    );
  }
  if (tone === "assisted") {
    return (
      <span aria-hidden className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-[#6b7280] text-[12px] font-bold text-white">
        ×
      </span>
    );
  }
  if (tone === "warning") {
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

/**
 * The paged, searchable check table shared by the Content sub-views (content
 * accessibility, content SEO). Each row links to that check's own screen.
 */
export function ModuleCheckTable({ checks }: { checks: SiteCheckRow[] }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(0);

  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const filtered = query
      ? checks.filter((row) => (row.display_name ?? row.check_id).toLowerCase().includes(query))
      : checks;
    return [...filtered].sort((a, b) => completenessRank(a) - completenessRank(b));
  }, [checks, search]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <>
      <div className="flex items-center gap-2 px-5 py-4">
        <h2 className="text-[20px] font-semibold text-black">Checks</h2>
        <span className="rounded-[3px] bg-[#f5f5f5] px-2.5 py-0.5 text-[13px] font-semibold text-[#525252]">
          {visible.length}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {searchOpen && (
            <input
              autoFocus
              value={search}
              onChange={(event) => { setSearch(event.target.value); setPage(0); }}
              placeholder="Search checks"
              aria-label="Search checks"
              className="h-9 w-[200px] rounded-[3px] border border-[#e5e5e5] px-3 text-sm outline-none focus:border-black"
            />
          )}
          <button type="button" aria-label="Columns" className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e5e5e5] px-3 text-[13px] font-medium text-[#525252]">
            <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
          </button>
          <button
            type="button"
            aria-label="Search"
            onClick={() => setSearchOpen((previous) => !previous)}
            className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] text-[#525252]"
          >
            <Search aria-hidden className="h-4 w-4" />
          </button>
          <button type="button" aria-label="More options" className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] text-[#525252]">
            <MoreHorizontal aria-hidden className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="h-[calc(100vh-420px)] min-h-[220px] overflow-auto">
      <table className="w-full border-t border-[#e5e5e5] text-left">
        <thead className="sticky top-0 z-10">
          <tr className="bg-[#fafafa] text-[13px] text-[#737373]">
            <th scope="col" className="px-5 py-3 font-medium">Name</th>
            <th scope="col" className="w-[90px] px-3 py-3 text-right font-medium">Issues</th>
            <th scope="col" className="w-[190px] py-3 pl-3 pr-5 font-medium">Progress</th>
          </tr>
        </thead>
        <tbody>
          {slice.map((row) => (
            <tr key={row.check_id} className="border-t border-[#e5e5e5]">
              <td className="px-5 py-3">
                <span className="flex items-start gap-2.5">
                  <CheckIcon tone={toneOf(row)} />
                  <span>
                    <button
                      type="button"
                      onClick={() => router.push(`/sites/${params.id}/checks/${row.check_id}`)}
                      className="text-left text-[14px] font-medium text-black hover:underline"
                    >
                      {row.display_name ?? row.check_id}
                    </button>
                    {row.wcag_criterion && (
                      <span className="ml-2 text-[13px] text-[#737373]">{row.wcag_criterion}</span>
                    )}
                  </span>
                </span>
              </td>
              <td className="px-3 py-3 text-right text-[14px] text-black">{row.issues ?? "—"}</td>
              <td className="py-3 pl-3 pr-5">
                <div className="flex items-center gap-2">
                  {/* An unscored check gets an empty track, not a 0% bar: its
                      findings are review items, not failures. */}
                  <div
                    className="h-2 w-full overflow-hidden rounded-[3px] bg-[#e5e5e5]"
                    role="progressbar"
                    aria-valuenow={row.progress ?? undefined}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label={`Progress for ${row.display_name ?? row.check_id}`}
                  >
                    {row.progress != null && (
                      <div
                        className="h-full rounded-[3px] bg-black"
                        style={{ width: `${Math.max(0, Math.min(100, Math.round(row.progress)))}%` }}
                      />
                    )}
                  </div>
                  <span className="w-[46px] flex-none text-right text-[13px] text-[#525252]">
                    {row.progress == null ? "—" : `${Math.round(row.progress)}%`}
                  </span>
                </div>
              </td>
            </tr>
          ))}
          {slice.length === 0 && (
            <tr>
              <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#737373]">
                No checks match “{search}”.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      </div>

      {pageCount > 1 && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1 border-t border-[#e5e5e5] py-4">
          {Array.from({ length: pageCount }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setPage(index)}
              aria-current={index === current ? "page" : undefined}
              className={`h-8 min-w-8 rounded-[3px] px-2 text-[13px] font-medium ${
                index === current ? "bg-black text-white" : "text-black hover:bg-[#f5f5f5]"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </nav>
      )}
    </>
  );
}

/** The second tab: only the checks that actually found something. */
export function ContentWithIssuesTab({ checks, heading }: { checks: SiteCheckRow[]; heading: string }) {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const withIssues = checks.filter((row) => (row.issues ?? 0) > 0);

  return (
    <div className="px-5 py-4">
      <h2 className="mb-3 text-[20px] font-semibold text-black">{heading}</h2>
      {withIssues.length === 0 ? (
        <p className="py-8 text-center text-sm text-[#737373]">No issues in the latest scan.</p>
      ) : (
        <ul className="divide-y divide-[#e5e5e5]">
          {withIssues.map((row) => (
            <li key={row.check_id} className="flex items-center gap-3 py-3">
              <CheckIcon tone={toneOf(row)} />
              <button
                type="button"
                onClick={() => router.push(`/sites/${params.id}/checks/${row.check_id}`)}
                className="flex-1 text-left text-[14px] font-medium text-black hover:underline"
              >
                {row.display_name ?? row.check_id}
              </button>
              <span className="text-[14px] text-[#525252]">
                {row.issues?.toLocaleString("en-US")} {row.issues === 1 ? "issue" : "issues"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
