"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, MoreHorizontal, ExternalLink, Lock } from "lucide-react";

import {
  getAmountOfContent,
  getSitePages,
  type AmountOfContent,
  type SitePageRow,
} from "@/lib/auth";
import { AreaTrend } from "@/components/platform/site/overview/OverviewPrimitives";

const PAGE_SIZE = 15;

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const parts = parsed.pathname.split("/").filter(Boolean);
    const tail = parts.length ? parts[parts.length - 1] : "";
    return parts.length > 1 ? `${parsed.host}/.../${tail}` : `${parsed.host}/${tail}`;
  } catch {
    return url;
  }
}

export default function AmountOfContentPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const requestKey = params.id;
  const [loaded, setLoaded] = useState<{
    key: string;
    content: AmountOfContent | null;
    scanId: string | null;
    rows: SitePageRow[] | null;
    error: string | null;
  }>({ key: "", content: null, scanId: null, rows: null, error: null });
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [ascending, setAscending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    Promise.all([getAmountOfContent(params.id), getSitePages(params.id, undefined, true)])
      .then(([content, pages]) => {
        if (!cancelled) {
          setLoaded({ key: requestKey, content, scanId: pages.scan_id, rows: pages.pages, error: null });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, content: null, scanId: null, rows: null,
            error: e instanceof Error ? e.message : "Failed to load amount of content",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const content = fresh?.content ?? null;
  const rows = useMemo(() => fresh?.rows ?? [], [fresh]);
  const error = fresh?.error ?? null;

  /** Pages and documents together, fewest words first as Silktide sorts them. */
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = query
      ? rows.filter((row) => `${row.title ?? ""} ${row.url}`.toLowerCase().includes(query))
      : rows;
    return [...matched].sort((a, b) => {
      const left = a.word_count ?? Number.POSITIVE_INFINITY;
      const right = b.word_count ?? Number.POSITIVE_INFINITY;
      return ascending ? left - right : right - left;
    });
  }, [rows, search, ascending]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  if (error) {
    return (
      <div className="light-theme bg-white p-8 text-sm text-[#737373]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!content || !fresh?.rows) {
    return <CompassLoader fullPage label="Loading amount of content…" />;
  }

  const wordPoints = content.history
    .filter((point): point is typeof point & { words: number } => point.words != null)
    .map((point) => ({ at: point.at, value: point.words }));
  const sentencePoints = content.history
    .filter((point): point is typeof point & { sentences: number } => point.sentences != null)
    .map((point) => ({ at: point.at, value: point.sentences }));
  const perPagePoints = content.history
    .filter((point): point is typeof point & { words_per_page: number } => point.words_per_page != null)
    .map((point) => ({ at: point.at, value: point.words_per_page }));

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-14">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Marketing</p>
        <h1 className="mt-3 max-w-[18ch] text-[40px] font-semibold leading-[0.95] tracking-[-0.05em] lg:text-[56px]">
          Amount of content
        </h1>
        <p className="mt-4 max-w-xl text-sm leading-6 text-[#525252]">
          How much copy this site carries across pages and documents — total words, sentences, and words per page.
        </p>
      </header>

      <section className="grid gap-3 px-6 py-8 sm:grid-cols-3 lg:px-12">
        <MetricCard
          total={content.totals.words}
          unit="Words"
          points={wordPoints}
          yLabel="Number of words"
        />
        <MetricCard
          total={content.totals.sentences}
          unit="Sentences"
          points={sentencePoints}
          yLabel="Number of sentences"
          emptyNote="Sentences are counted from the next scan onwards."
        />
        <MetricCard
          total={content.totals.words_per_page}
          unit="Words per page"
          points={perPagePoints}
          yLabel="Number of words per page"
        />
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-12 lg:px-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Inventory</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pages &amp; documents</h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-2 text-sm text-[#737373]">{visible.length} total</p>
            {searchOpen && (
              <input
                autoFocus
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                placeholder="Search pages"
                aria-label="Search pages"
                className="h-9 w-[200px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none placeholder:text-[#737373] focus:border-black"
              />
            )}
            <button
              type="button"
              aria-label="Columns"
              className="flex h-9 items-center gap-1.5 border border-[#e5e5e5] px-3 text-[13px] font-medium text-[#525252] hover:border-black"
            >
              <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
            </button>
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen((previous) => !previous)}
              className={`grid h-9 w-9 place-items-center border ${
                searchOpen ? "border-black bg-black text-white" : "border-[#e5e5e5] text-[#525252] hover:border-black"
              }`}
            >
              <Search aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="More options"
              className="grid h-9 w-9 place-items-center border border-[#e5e5e5] text-[#525252] hover:border-black"
            >
              <MoreHorizontal aria-hidden className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="overflow-x-auto border border-[#e5e5e5]">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-[#e5e5e5] text-[11px] uppercase tracking-[0.14em] text-[#737373]">
                <th scope="col" className="w-[52px]" />
                <th scope="col" className="px-4 py-3 font-medium">Title / URL</th>
                <th scope="col" className="w-[130px] py-3 pl-3 pr-5 text-right font-medium">
                  <button
                    type="button"
                    onClick={() => setAscending((previous) => !previous)}
                    className="inline-flex items-center gap-1 hover:text-black"
                  >
                    Words <span aria-hidden>{ascending ? "▲" : "▼"}</span>
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.page_id} className="border-b border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
                  <td className="py-3 pl-4">
                    <button
                      type="button"
                      onClick={() => {
                        if (fresh.scanId) {
                          router.push(`/scans/${fresh.scanId}/inspect?page=${row.page_id}`);
                        }
                      }}
                      aria-label={`Inspect ${row.title || row.url}`}
                      className="grid h-8 w-8 place-items-center bg-black text-white hover:bg-[#262626]"
                    >
                      <Search aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap items-center gap-2">
                      {row.is_error_page && (
                        <span className="border border-black px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]">
                          404
                        </span>
                      )}
                      <span className="text-[14px] font-medium">
                        {row.title || row.url.split("/").pop() || row.url}
                      </span>
                      {row.cms && (
                        <span className="bg-black px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                          {row.cms}
                        </span>
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[#737373]">
                      <Lock aria-hidden className="h-3 w-3" />
                      <span className="truncate" title={row.url}>{shortUrl(row.url)}</span>
                      <a href={row.url} target="_blank" rel="noreferrer" aria-label={`Open ${row.url} in a new tab`} className="hover:text-black">
                        <ExternalLink aria-hidden className="h-3 w-3" />
                      </a>
                    </div>
                  </td>
                  <td className="py-3 pl-3 pr-5 text-right text-[14px] tabular-nums">
                    {row.word_count?.toLocaleString("en-US") ?? "—"}
                  </td>
                </tr>
              ))}
              {slice.length === 0 && (
                <tr>
                  <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#737373]">
                    No pages match “{search}”.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {pageCount > 1 && (
          <nav aria-label="Pagination" className="mt-6 flex flex-wrap items-center justify-center gap-1">
            {Array.from({ length: pageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
                aria-current={index === current ? "page" : undefined}
                className={`h-8 min-w-8 px-2 text-[13px] font-medium ${
                  index === current
                    ? "bg-black text-white"
                    : "border border-[#e5e5e5] text-black hover:border-black"
                }`}
              >
                {index + 1}
              </button>
            ))}
          </nav>
        )}
      </section>
    </div>
  );
}

/** A headline total with its trend, as each of the three cards presents it. */
function MetricCard({
  total,
  unit,
  points,
  yLabel,
  emptyNote,
}: {
  total: number | null;
  unit: string;
  points: { at: string; value: number }[];
  yLabel: string;
  /** Shown instead of the chart when the metric has no history yet. */
  emptyNote?: string;
}) {
  return (
    <section className="flex min-h-[220px] flex-col justify-between border border-[#e5e5e5] bg-[#fafafa] p-6 hover:border-black">
      <div>
        <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{unit}</p>
        <p className="mt-2 text-[36px] font-semibold leading-none tracking-[-0.05em]">
          {total?.toLocaleString("en-US") ?? "—"}
        </p>
      </div>
      <div className="mt-6">
        {points.length === 0 && emptyNote ? (
          <p className="text-[13px] text-[#737373]">{emptyNote}</p>
        ) : (
          <AreaTrend points={points} color="#111111" fill="#e5e5e5" yLabel={yLabel} ariaLabel={`${unit} over time`} />
        )}
      </div>
    </section>
  );
}
