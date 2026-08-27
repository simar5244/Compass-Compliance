"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useSiteCategory } from "@/components/platform/site/useSiteCategory";
import { Search, SlidersHorizontal, MoreHorizontal, ExternalLink, Lock, FileText } from "lucide-react";

import { artifactUrl } from "@/lib/api";
import { getSitePages, type SitePageRow } from "@/lib/auth";
import { CATEGORY_LABEL } from "@/components/platform/ui";
import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";

const PAGE_SIZE = 20;
/** How many thumbnails the "most issues" strip carries. */
const STRIP_SIZE = 12;

type SortKey = "score" | "title";

function pageTitle(page: SitePageRow): string {
  return page.title?.trim() || page.url;
}

/** The path portion, elided in the middle the way the reference does. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const segments = parsed.pathname.split("/").filter(Boolean);
    const last = segments.at(-1);
    return last ? `${parsed.host}/.../${last}` : parsed.host;
  } catch {
    return url;
  }
}

function PageThumbnail({ page, scanId, onOpen }: { page: SitePageRow; scanId: string | null; onOpen: () => void }) {
  const [failed, setFailed] = useState(false);
  const src = scanId && page.desktop_screenshot_ref ? artifactUrl(scanId, page.desktop_screenshot_ref) : null;
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-[168px] flex-none flex-col gap-2 text-left"
      aria-label={pageTitle(page)}
    >
      <span className="block h-[128px] w-full overflow-hidden border border-[#e5e5e5] bg-[#f5f5f5]">
        {src && !failed ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={src}
            alt=""
            className="h-full w-full object-cover object-top"
            onError={() => setFailed(true)}
          />
        ) : (
          <span className="grid h-full w-full place-items-center text-[11px] text-[#737373]">No screenshot</span>
        )}
      </span>
      <span className="line-clamp-3 text-[13px] font-medium leading-[18px] text-black">
        {pageTitle(page)}
      </span>
    </button>
  );
}

export default function CategoryPagesPage() {
  const params = useParams<{ id: string; category: string }>();
  const router = useRouter();
  // The fetch result is tagged with the site+category it belongs to, so switching
  // category shows a loading state without resetting state inside an effect.
  const [loaded, setLoaded] = useState<{
    key: string;
    scanId: string | null;
    pages: SitePageRow[] | null;
    error: string | null;
  }>({ key: "", scanId: null, pages: null, error: null });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);

  const category = useSiteCategory();
  const categoryLabel = CATEGORY_LABEL[category] ?? category;
  const requestKey = `${params.id}:${category}`;

  const fresh = loaded.key === requestKey ? loaded : null;
  const scanId = fresh?.scanId ?? null;
  const pages = fresh?.pages ?? null;
  const error = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    getSitePages(params.id, category)
      .then((r) => {
        if (!cancelled) setLoaded({ key: requestKey, scanId: r.scan_id, pages: r.pages, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            scanId: null,
            pages: null,
            error: e instanceof Error ? e.message : "Failed to load pages",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, category, requestKey]);

  const rows = useMemo(() => pages ?? [], [pages]);

  /** Score for this category, falling back to the page's overall score. */
  const scoreOf = (row: SitePageRow) => row.category_score ?? row.score;

  const mostIssues = useMemo(
    () =>
      [...rows]
        .filter((r) => (r.category_issue_count ?? 0) > 0)
        .sort((a, b) => (b.category_issue_count ?? 0) - (a.category_issue_count ?? 0))
        .slice(0, STRIP_SIZE),
    [rows],
  );

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${pageTitle(r)} ${r.url}`.toLowerCase().includes(q))
      : rows;
    const ordered = [...filtered].sort((a, b) => {
      if (sort === "title") return pageTitle(a).localeCompare(pageTitle(b));
      // Unscored pages sort last regardless of direction.
      const left = scoreOf(a);
      const right = scoreOf(b);
      if (left == null) return 1;
      if (right == null) return -1;
      return left - right;
    });
    return ascending ? ordered : ordered.reverse();
  }, [rows, search, sort, ascending]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  function toggleSort(key: SortKey) {
    if (sort === key) setAscending((previous) => !previous);
    else {
      setSort(key);
      setAscending(true);
    }
    setPage(0);
  }

  function openInspector(row: SitePageRow) {
    if (!scanId) return;
    const from = `/sites/${params.id}/${category}/pages`;
    router.push(`/scans/${scanId}/inspect?page=${row.page_id}&from=${encodeURIComponent(from)}`);
  }

  if (error) {
    return (
      <div className="bg-white px-8 py-10">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!pages) return <CompassLoader fullPage label="Loading pages…" />;

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-8 lg:px-12">
        <div className="flex items-start gap-4">
          <span
            aria-hidden
            className="mt-1 grid h-12 w-12 flex-none place-items-center border border-[#e5e5e5] bg-[#fafafa] text-[#525252]"
          >
            <FileText className="h-5 w-5" />
          </span>
          <div>
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{categoryLabel}</p>
            <h1 className="mt-1 text-[32px] font-semibold leading-none tracking-[-0.04em] lg:text-[40px]">
              Pages
            </h1>
            <p className="mt-3 max-w-[62ch] text-[14px] leading-6 text-[#525252]">
              All website pages with identified {categoryLabel.toLowerCase()} issues to improve.
            </p>
          </div>
        </div>
      </header>

      <div className="px-6 py-8 lg:px-12">
        {mostIssues.length > 0 && (
          <section className="mb-6 border border-[#e5e5e5] bg-[#fafafa] p-5">
            <h2 className="mb-4 text-[13px] font-semibold uppercase tracking-[0.14em] text-[#737373]">
              Pages with most issues
            </h2>
            <div className="flex gap-4 overflow-x-auto pb-2">
              {mostIssues.map((row) => (
                <PageThumbnail key={row.page_id} page={row} scanId={scanId} onOpen={() => openInspector(row)} />
              ))}
            </div>
          </section>
        )}

        <section className="border border-[#e5e5e5] bg-white">
          <div className="flex items-center gap-2 border-b border-[#e5e5e5] px-5 py-4">
            <h2 className="text-[20px] font-semibold tracking-tight">Pages</h2>
            <span className="rounded-[3px] bg-[#f5f5f5] px-2.5 py-0.5 text-[13px] font-semibold text-[#525252]">
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
                  className="h-9 w-[220px] rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none placeholder:text-[#737373] focus:border-black"
                />
              )}
              <button
                type="button"
                aria-label="Columns"
                className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e5e5e5] px-3 text-[13px] font-medium text-[#525252] hover:border-black hover:text-black"
              >
                <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
              </button>
              <button
                type="button"
                aria-label="Search"
                onClick={() => setSearchOpen((previous) => !previous)}
                className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] text-[#525252] hover:border-black hover:text-black"
              >
                <Search aria-hidden className="h-4 w-4" />
              </button>
              <button
                type="button"
                aria-label="More options"
                className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] text-[#525252] hover:border-black hover:text-black"
              >
                <MoreHorizontal aria-hidden className="h-4 w-4" />
              </button>
            </div>
          </div>

          <table className="w-full text-left">
            <thead>
              <tr className="bg-[#fafafa] text-[13px] text-[#737373]">
                <th scope="col" className="w-[52px]" />
                <th scope="col" className="px-3 py-3 font-medium">
                  <button type="button" onClick={() => toggleSort("title")} className="inline-flex items-center gap-1 hover:text-black">
                    Title / URL {sort === "title" && <span aria-hidden>{ascending ? "▲" : "▼"}</span>}
                  </button>
                </th>
                <th scope="col" className="w-[140px] py-3 pl-3 pr-5 text-right font-medium">
                  <button type="button" onClick={() => toggleSort("score")} className="inline-flex items-center gap-1 hover:text-black">
                    Score {sort === "score" && <span aria-hidden>{ascending ? "▲" : "▼"}</span>}
                  </button>
                </th>
              </tr>
            </thead>
            <tbody>
              {slice.map((row) => (
                <tr key={row.page_id} className="border-t border-[#e5e5e5] align-middle hover:bg-[#fafafa]">
                  <td className="py-3 pl-5">
                    <button
                      type="button"
                      onClick={() => openInspector(row)}
                      aria-label={`Inspect ${pageTitle(row)}`}
                      className="grid h-8 w-8 place-items-center rounded-[3px] border border-[#e5e5e5] text-[#525252] hover:border-black hover:bg-white hover:text-black"
                    >
                      <Search aria-hidden className="h-4 w-4" />
                    </button>
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => openInspector(row)}
                        className="truncate text-[14px] font-medium text-black hover:underline"
                      >
                        {pageTitle(row)}
                      </button>
                      {row.cms && (
                        <span className="flex-none rounded-[3px] bg-black px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">
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
                  <td className="py-3 pl-3 pr-5">
                    <div className="flex items-center justify-end gap-2">
                      <InspectorScoreRing score={scoreOf(row)} size={26} stroke={3} showValue={false} />
                      <span className="text-[15px] font-semibold text-black">
                        {scoreOf(row) == null ? "—" : `${Math.round(scoreOf(row)!)}`}
                        {scoreOf(row) != null && <span className="align-top text-[10px]">%</span>}
                      </span>
                    </div>
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

          {pageCount > 1 && (
            <nav aria-label="Pagination" className="flex items-center justify-center gap-1 border-t border-[#e5e5e5] py-4">
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
        </section>
      </div>
    </div>
  );
}
