"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, MoreHorizontal, ExternalLink, Lock, X } from "lucide-react";

import { getSitePages, ignoreIssues, type SitePageRow } from "@/lib/auth";

const PAGE_SIZE = 10;

type SortKey = "reading_age" | "title";

function pageTitle(page: SitePageRow): string {
  return page.title?.trim() || page.url;
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    return last ? `${parsed.host}/.../${last}` : parsed.host;
  } catch {
    return url;
  }
}

const TABS = ["Pages"] as const;

const INTRO =
  "Easier to read text is more accessible, more usable, and gives a greater sense of fluency to the " +
  "end user. Reading age is the school year a reader needs to follow the page comfortably, calculated " +
  "from sentence length and word complexity. Aim for a reading age of around 12 for general audiences: " +
  "long sentences and specialist vocabulary push it higher, and shortening sentences is usually the " +
  "fastest way to bring it down.";

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

export default function ReadabilityPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState<{
    key: string;
    scanId: string | null;
    pages: SitePageRow[] | null;
    error: string | null;
  }>({ key: "", scanId: null, pages: null, error: null });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("reading_age");
  const [descending, setDescending] = useState(true);
  const [page, setPage] = useState(0);
  const [ignoredPages, setIgnoredPages] = useState<Set<string>>(new Set());

  const requestKey = params.id;
  const fresh = loaded.key === requestKey ? loaded : null;
  const scanId = fresh?.scanId ?? null;
  const pages = fresh?.pages ?? null;
  const error = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    getSitePages(params.id, "content")
      .then((r) => {
        if (!cancelled) setLoaded({ key: requestKey, scanId: r.scan_id, pages: r.pages, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, scanId: null, pages: null,
            error: e instanceof Error ? e.message : "Failed to load readability results",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const rows = useMemo(
    // A page with no prose has no reading age to report.
    () => (pages ?? []).filter((p) => p.reading_age != null && !ignoredPages.has(p.page_id)),
    [pages, ignoredPages],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${pageTitle(r)} ${r.url}`.toLowerCase().includes(q))
      : rows;
    const ordered = [...filtered].sort((a, b) =>
      sort === "title"
        ? pageTitle(a).localeCompare(pageTitle(b))
        : (a.reading_age ?? 0) - (b.reading_age ?? 0),
    );
    return descending ? ordered.reverse() : ordered;
  }, [rows, search, sort, descending]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const averageAge = useMemo(() => {
    if (rows.length === 0) return null;
    const total = rows.reduce((sum, row) => sum + (row.reading_age ?? 0), 0);
    return total / rows.length;
  }, [rows]);

  const hardest = useMemo(() => {
    if (rows.length === 0) return null;
    return Math.max(...rows.map((row) => row.reading_age ?? 0));
  }, [rows]);

  function toggleSort(key: SortKey) {
    if (sort === key) setDescending((previous) => !previous);
    else {
      setSort(key);
      setDescending(key === "reading_age");
    }
    setPage(0);
  }

  function inspect(row: SitePageRow) {
    if (!scanId) return;
    const from = `/sites/${params.id}/content/readability`;
    router.push(`/scans/${scanId}/inspect?page=${row.page_id}&from=${encodeURIComponent(from)}`);
  }

  async function ignorePage(row: SitePageRow) {
    setIgnoredPages((previous) => new Set(previous).add(row.page_id));
    try {
      await ignoreIssues(params.id, []);
    } catch {
      // Restore the row if the request failed.
      setIgnoredPages((previous) => {
        const next = new Set(previous);
        next.delete(row.page_id);
        return next;
      });
    }
  }

  if (error) {
    return (
      <div className="bg-white px-6 py-10 text-sm text-[#737373] lg:px-12">{error}</div>
    );
  }
  if (!pages) return <CompassLoader fullPage label="Loading readability results…" />;

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Content</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">
          Consider making text easier to understand
        </h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">{INTRO}</p>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Pages</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{rows.length}</p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Average age</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {averageAge == null ? "—" : averageAge.toFixed(1)}
            </p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Hardest</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {hardest == null ? "—" : hardest.toFixed(1)}
            </p>
          </div>
        </div>
      </header>

      <section className="px-6 py-8 lg:px-12">
        <div className="mb-4 flex gap-1 border-b border-[#e5e5e5]">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              aria-current="page"
              className="-mb-px border-b-2 border-black px-4 py-3 text-sm font-medium text-black"
            >
              {item}
            </button>
          ))}
        </div>

        <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
          <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
            <h2 className="text-lg font-semibold">Pages &amp; documents</h2>
            <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
              {visible.length}
            </span>
            <div className="ml-auto flex items-center gap-2">
              {searchOpen && (
                <input
                  autoFocus
                  value={search}
                  onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                  placeholder="Search pages"
                  aria-label="Search pages"
                  className="h-9 w-[200px] rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none focus:border-black"
                />
              )}
              <button
                type="button"
                aria-label="Columns"
                className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-[13px] font-medium text-black hover:bg-[#fafafa]"
              >
                <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
              </button>
              <button
                type="button"
                aria-label="Search"
                onClick={() => setSearchOpen((previous) => !previous)}
                className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa]"
              >
                <Search aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="More options"
                className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa]"
              >
                <MoreHorizontal aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
                <th scope="col" className="w-[52px]" />
                <th scope="col" className="px-3 py-3 font-medium">
                  <button type="button" onClick={() => toggleSort("title")} className="inline-flex items-center gap-1 hover:text-black">
                    Title / URL {sort === "title" && <span aria-hidden>{descending ? "▼" : "▲"}</span>}
                  </button>
                </th>
                <th scope="col" className="w-[130px] px-3 py-3 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("reading_age")} className="inline-flex items-center gap-1 hover:text-black">
                    Reading age {sort === "reading_age" && <span aria-hidden>{descending ? "▼" : "▲"}</span>}
                  </button>
                </th>
                <th scope="col" className="w-[160px] py-3 pl-3 pr-5 text-right font-medium">Controls</th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.page_id} className="border-b border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
                  <td className="py-3 pl-5">
                    <button
                      type="button"
                      onClick={() => inspect(row)}
                      aria-label={`Inspect ${pageTitle(row)}`}
                      className="grid h-8 w-8 place-items-center rounded-[3px] bg-black text-white hover:bg-[#262626]"
                    >
                      <Search aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => inspect(row)}
                        className="truncate text-[14px] font-medium text-black underline-offset-2 hover:underline"
                      >
                        {pageTitle(row)}
                      </button>
                      {row.cms && (
                        <span className="flex-none rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] px-1.5 py-0.5 text-[10px] font-bold uppercase text-[#525252]">
                          {row.cms}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[#737373]">
                      <Lock aria-hidden className="h-3 w-3" />
                      <span className="truncate" title={row.url}>{shortUrl(row.url)}</span>
                      <a href={row.url} target="_blank" rel="noreferrer" aria-label={`Open ${pageTitle(row)} in a new tab`} className="hover:text-black">
                        <ExternalLink aria-hidden className="h-3 w-3" />
                      </a>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-right text-[15px] font-semibold tabular-nums">
                    {row.reading_age?.toFixed(1)}
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right">
                    <button
                      type="button"
                      onClick={() => void ignorePage(row)}
                      className="inline-flex items-center gap-1.5 rounded-[3px] border border-[#e5e5e5] bg-white px-3 py-1.5 text-[13px] font-semibold text-black hover:border-black"
                    >
                      <X aria-hidden className="h-3.5 w-3.5" /> Ignore this page
                    </button>
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-5 py-10 text-center text-sm text-[#737373]">
                    {rows.length === 0
                      ? "No pages had enough prose to measure a reading age."
                      : `No pages match “${search}”.`}
                  </td>
                </tr>
              )}
            </tbody>
          </table>

          <Pagination pageCount={pageCount} current={current} onPage={setPage} />
        </div>
      </section>
    </div>
  );
}
