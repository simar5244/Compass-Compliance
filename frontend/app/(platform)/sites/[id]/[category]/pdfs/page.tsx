"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useSiteCategory } from "@/components/platform/site/useSiteCategory";
import { Search, SlidersHorizontal, MoreHorizontal, ExternalLink, Lock } from "lucide-react";

import { getSitePdfs, type SitePdfRow } from "@/lib/auth";
import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";

const PAGE_SIZE = 20;

type SortKey = "score" | "title";

function documentTitle(row: SitePdfRow): string {
  return row.title?.trim() || row.url.split("/").pop() || row.url;
}

/** The path portion, elided in the middle the way the reference does. */
function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    const last = parsed.pathname.split("/").filter(Boolean).at(-1);
    return last ? `${parsed.host}/.../${last}` : parsed.host;
  } catch {
    return url;
  }
}

export default function CategoryPdfsPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState<{
    key: string;
    scanId: string | null;
    pdfs: SitePdfRow[] | null;
    error: string | null;
  }>({ key: "", scanId: null, pdfs: null, error: null });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("score");
  const [ascending, setAscending] = useState(true);
  const [page, setPage] = useState(0);

  const category = useSiteCategory();
  const requestKey = `${params.id}:${category}`;
  const fresh = loaded.key === requestKey ? loaded : null;
  const scanId = fresh?.scanId ?? null;
  const pdfs = fresh?.pdfs ?? null;
  const error = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    getSitePdfs(params.id, category)
      .then((r) => {
        if (!cancelled) setLoaded({ key: requestKey, scanId: r.scan_id, pdfs: r.pdfs, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey,
            scanId: null,
            pdfs: null,
            error: e instanceof Error ? e.message : "Failed to load PDFs",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, category, requestKey]);

  const rows = useMemo(() => pdfs ?? [], [pdfs]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? rows.filter((r) => `${documentTitle(r)} ${r.url}`.toLowerCase().includes(q))
      : rows;
    const ordered = [...filtered].sort((a, b) => {
      if (sort === "title") return documentTitle(a).localeCompare(documentTitle(b));
      // Unparsed documents sort last regardless of direction.
      if (a.score == null) return 1;
      if (b.score == null) return -1;
      return a.score - b.score;
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

  function openInspector(row: SitePdfRow) {
    if (!scanId) return;
    const from = `/sites/${params.id}/${category}/pdfs`;
    router.push(`/scans/${scanId}/inspect?page=${row.page_id}&from=${encodeURIComponent(from)}`);
  }

  if (error) return <div className="bg-white p-8 text-black">{error}</div>;
  if (!pdfs) return <CompassLoader fullPage label="Loading PDFs…" />;

  return (
    <div className="bg-white px-6 py-10 lg:px-12">
      <header className="mb-8 border-b border-[#e5e5e5] pb-8">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Documents</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight text-black">PDFs</h1>
        <p className="mt-2 max-w-2xl text-sm text-[#737373]">
          All PDF documents with identified issues to improve.
        </p>
      </header>

      <section className="border border-[#e5e5e5] bg-white rounded-[3px]">
        <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
          <h2 className="text-lg font-semibold text-black">PDFs</h2>
          <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
            {visible.length}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {searchOpen && (
              <input
                autoFocus
                value={search}
                onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                placeholder="Search PDFs"
                aria-label="Search PDFs"
                className="h-9 w-[220px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none placeholder:text-[#a3a3a3] focus:border-black rounded-[3px]"
              />
            )}
            <button
              type="button"
              aria-label="Columns"
              className="flex h-9 items-center gap-1.5 border border-[#e5e5e5] bg-white px-3 text-[13px] font-medium text-black hover:bg-[#fafafa] rounded-[3px]"
            >
              <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
            </button>
            <button
              type="button"
              aria-label="Search"
              onClick={() => setSearchOpen((previous) => !previous)}
              className="grid h-9 w-9 place-items-center border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa] rounded-[3px]"
            >
              <Search aria-hidden className="h-4 w-4" />
            </button>
            <button
              type="button"
              aria-label="More options"
              className="grid h-9 w-9 place-items-center border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa] rounded-[3px]"
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
                <button type="button" onClick={() => toggleSort("title")} className="inline-flex items-center gap-1">
                  Title / URL {sort === "title" && <span aria-hidden>{ascending ? "▲" : "▼"}</span>}
                </button>
              </th>
              <th scope="col" className="w-[140px] py-3 pl-3 pr-5 text-right font-medium">
                <button type="button" onClick={() => toggleSort("score")} className="inline-flex items-center gap-1">
                  Score {sort === "score" && <span aria-hidden>{ascending ? "▲" : "▼"}</span>}
                </button>
              </th>
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => (
              <tr key={row.page_id} className="border-b border-[#e5e5e5] align-middle last:border-b-0 hover:bg-[#fafafa]">
                <td className="py-3 pl-5">
                  <button
                    type="button"
                    onClick={() => openInspector(row)}
                    aria-label={`Inspect ${documentTitle(row)}`}
                    className="grid h-8 w-8 place-items-center border border-black bg-black text-white hover:bg-[#262626] rounded-[3px]"
                  >
                    <Search aria-hidden className="h-4 w-4" />
                  </button>
                </td>
                <td className="px-3 py-3">
                  <button
                    type="button"
                    onClick={() => openInspector(row)}
                    className="block max-w-full truncate text-left text-[14px] font-medium text-black hover:underline"
                  >
                    {documentTitle(row)}
                  </button>
                  <div className="mt-1 flex items-center gap-1.5 text-[12px] text-[#737373]">
                    <Lock aria-hidden className="h-3 w-3" />
                    <span className="truncate" title={row.url}>{shortUrl(row.url)}</span>
                    <a href={row.url} target="_blank" rel="noreferrer" aria-label={`Open ${documentTitle(row)} in a new tab`}>
                      <ExternalLink aria-hidden className="h-3 w-3" />
                    </a>
                  </div>
                </td>
                <td className="py-3 pl-3 pr-5">
                  <div className="flex items-center justify-end gap-2" title={`${row.checks_failed} of ${row.checks_total} PDF checks failed`}>
                    <InspectorScoreRing score={row.score} size={26} stroke={3} showValue={false} />
                    <span className="text-[15px] font-semibold tabular-nums text-black">
                      {row.score == null ? "—" : row.score}
                      {row.score != null && <span className="align-top text-[10px]">%</span>}
                    </span>
                  </div>
                </td>
              </tr>
            ))}
            {slice.length === 0 && (
              <tr>
                <td colSpan={3} className="px-5 py-10 text-center text-sm text-[#737373]">
                  {rows.length === 0
                    ? "No PDF documents were found in this crawl."
                    : `No PDFs match “${search}”.`}
                </td>
              </tr>
            )}
          </tbody>
        </table>

        {pageCount > 1 && (
          <nav aria-label="Pagination" className="flex flex-wrap items-center justify-center gap-1 border-t border-[#e5e5e5] py-4">
            {Array.from({ length: pageCount }).map((_, index) => (
              <button
                key={index}
                type="button"
                onClick={() => setPage(index)}
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
        )}
      </section>
    </div>
  );
}
