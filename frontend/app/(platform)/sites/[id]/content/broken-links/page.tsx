"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, MoreHorizontal, ExternalLink, Lock, X } from "lucide-react";

import { getCheckLinksFull, ignoreIssues, type BrokenLinkFullRow } from "@/lib/auth";
import { rollUpPages, type AffectedPage } from "@/components/platform/site/AffectedPagesTab";

const PAGE_SIZE = 10;

type LinkTypeFilter = "all" | "internal" | "external";

/**
 * A definite 4xx from the server is a broken link. A refused connection, a
 * timeout or a 5xx may equally be a blocked bot or a flaky host, so those are
 * reported separately rather than asserted as broken.
 */
function confidenceOf(row: BrokenLinkFullRow): "likely" | "potential" {
  const status = row.http_status ?? 0;
  // 405 means the server refused the method we probed with, not that the page
  // is missing — a visitor following the link in a browser may well reach it.
  if (status === 404 || status === 410 || status === 400) return "likely";
  return "potential";
}

/** Wording for the Status column, from the response we actually got. */
function statusLabel(row: BrokenLinkFullRow): { text: string; pill: boolean } {
  const status = row.http_status ?? 0;
  if (status === 404 || status === 410) return { text: "Page not found", pill: false };
  if (status >= 400) return { text: `HTTP error${status ? ` (${status})` : ""}`, pill: true };
  return { text: "Failed", pill: true };
}

function displayUrl(url: string): string {
  return url.replace(/^https?:\/\//, "");
}

const TABS = ["Broken links", "Pages"] as const;

const INTRO =
  "Broken links are links that don't work when clicked, leading to error pages, missing content, " +
  "or websites that can't be reached. Every link on every page is followed, including links inside " +
  "body text, so a link that has quietly gone stale is found even if nothing else on the page changed. " +
  "Likely broken links returned a definite error; potential broken links failed in a way that can also " +
  "be caused by the destination blocking automated requests, so they are worth checking by hand.";

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

export default function BrokenLinksPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState<{
    key: string;
    scanId: string | null;
    rows: BrokenLinkFullRow[] | null;
    error: string | null;
  }>({ key: "", scanId: null, rows: null, error: null });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [linkType, setLinkType] = useState<LinkTypeFilter>("all");
  const [page, setPage] = useState(0);
  const [ignored, setIgnored] = useState<Set<string>>(new Set());
  const [tab, setTab] = useState<(typeof TABS)[number]>("Broken links");

  const requestKey = params.id;
  const fresh = loaded.key === requestKey ? loaded : null;
  const scanId = fresh?.scanId ?? null;
  const rows = useMemo(() => fresh?.rows ?? [], [fresh]);
  const error = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    getCheckLinksFull(params.id, "broken-links")
      .then((r) => {
        if (!cancelled) setLoaded({ key: requestKey, scanId: r.scan_id, rows: r.items, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, scanId: null, rows: null,
            error: e instanceof Error ? e.message : "Failed to load broken links",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (ignored.has(row.url)) return false;
      if (linkType !== "all" && row.link_type !== linkType) return false;
      if (q && !`${row.url} ${row.anchor_text ?? ""}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, search, linkType, ignored]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  const sections = useMemo(() => ([
    { key: "likely", label: "Likely broken links",
      items: slice.filter((r) => confidenceOf(r) === "likely") },
    { key: "potential", label: "Potential broken links",
      items: slice.filter((r) => confidenceOf(r) === "potential") },
  ].filter((section) => section.items.length > 0)), [slice]);

  const likelyCount = useMemo(
    () => rows.filter((row) => !ignored.has(row.url) && confidenceOf(row) === "likely").length,
    [rows, ignored],
  );

  /** One row per page, counting the broken links found on it. */
  const affectedPages = useMemo(
    () => rollUpPages(visible.flatMap((row) => row.instances)),
    [visible],
  );

  function inspectPage(target: AffectedPage) {
    if (!scanId) return;
    const from = `/sites/${params.id}/content/broken-links`;
    const issue = target.issue_id ? `&issue=${target.issue_id}` : "";
    router.push(`/scans/${scanId}/inspect?page=${target.page_id}${issue}&from=${encodeURIComponent(from)}`);
  }

  function inspect(row: BrokenLinkFullRow) {
    const instance = row.instances[0];
    if (!scanId || !instance) return;
    const from = `/sites/${params.id}/content/broken-links`;
    router.push(
      `/scans/${scanId}/inspect?page=${instance.page_id}&issue=${instance.issue_id}&from=${encodeURIComponent(from)}`,
    );
  }

  async function ignoreLink(row: BrokenLinkFullRow) {
    const ids = row.instances.map((i) => i.issue_id);
    setIgnored((previous) => new Set(previous).add(row.url));
    try {
      await ignoreIssues(params.id, ids);
    } catch {
      // Put it back if the server rejected the change.
      setIgnored((previous) => {
        const next = new Set(previous);
        next.delete(row.url);
        return next;
      });
    }
  }

  if (error) return <div className="bg-white p-8 text-black">{error}</div>;
  if (!fresh?.rows) return <CompassLoader fullPage label="Loading broken links…" />;

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Content</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">Check and fix broken links</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">{INTRO}</p>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Links</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{visible.length}</p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Likely</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{likelyCount}</p>
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

        {tab === "Pages" ? (
          <PagesPanel pages={affectedPages} countLabel="Broken links" onInspect={inspectPage} />
        ) : (
          <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
            <div className="flex flex-wrap items-center gap-2 border-b border-[#e5e5e5] px-5 py-4">
              <h2 className="text-lg font-semibold text-black">Broken links</h2>
              <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
                {visible.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {searchOpen && (
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                    placeholder="Search links"
                    aria-label="Search links"
                    className="h-9 w-[200px] rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none placeholder:text-[#a3a3a3] focus:border-black"
                  />
                )}
                <button type="button" aria-label="Columns" className="flex h-9 items-center gap-1.5 rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-[13px] font-medium text-black hover:bg-[#fafafa]">
                  <SlidersHorizontal aria-hidden className="h-4 w-4" /> Columns
                </button>
                <select
                  value={linkType}
                  onChange={(event) => { setLinkType(event.target.value as LinkTypeFilter); setPage(0); }}
                  aria-label="Link type"
                  className="h-9 rounded-[3px] border border-[#e5e5e5] bg-white px-2 text-[13px] font-medium text-black"
                >
                  <option value="all">Internal and external</option>
                  <option value="internal">Internal only</option>
                  <option value="external">External only</option>
                </select>
                <button
                  type="button"
                  aria-label="Search"
                  onClick={() => setSearchOpen((previous) => !previous)}
                  className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa]"
                >
                  <Search aria-hidden className="h-4 w-4" />
                </button>
                <button type="button" aria-label="More options" className="grid h-9 w-9 place-items-center rounded-[3px] border border-[#e5e5e5] bg-white text-black hover:bg-[#fafafa]">
                  <MoreHorizontal aria-hidden className="h-4 w-4" />
                </button>
              </div>
            </div>

            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
                  <th scope="col" className="w-[52px]" />
                  <th scope="col" className="px-3 py-3 font-medium">Link</th>
                  <th scope="col" className="w-[120px] px-3 py-3 font-medium">Link type</th>
                  <th scope="col" className="w-[150px] px-3 py-3 font-medium">Status</th>
                  <th scope="col" className="w-[90px] px-3 py-3 text-right font-medium">Quantity</th>
                  <th scope="col" className="w-[140px] py-3 pl-3 pr-5 text-right font-medium">Controls</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((section) => (
                  <Fragment key={section.key}>
                    <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
                      <td colSpan={6} className="px-5 py-2.5">
                        <span className="flex items-center gap-2 text-[14px] font-semibold text-black">
                          <span
                            aria-hidden
                            className={`inline-flex h-5 w-5 flex-none items-center justify-center rounded-[3px] text-[12px] font-bold ${
                              section.key === "likely"
                                ? "bg-black text-white"
                                : "border border-black bg-white text-black"
                            }`}
                          >
                            !
                          </span>
                          {section.label}
                        </span>
                      </td>
                    </tr>
                    {section.items.map((row) => {
                      const status = statusLabel(row);
                      return (
                        <tr key={row.url} className="border-b border-[#e5e5e5] align-top last:border-b-0 hover:bg-[#fafafa]">
                          <td className="py-3 pl-5">
                            <button
                              type="button"
                              onClick={() => inspect(row)}
                              disabled={!row.instances.length}
                              aria-label={`Inspect ${row.url}`}
                              className="grid h-8 w-8 place-items-center rounded-[3px] border border-black bg-black text-white hover:bg-[#262626] disabled:opacity-40"
                            >
                              <Search aria-hidden className="h-4 w-4" />
                            </button>
                          </td>
                          <td className="px-3 py-3">
                            <div className="flex items-start gap-1.5">
                              <Lock aria-hidden className="mt-1 h-3 w-3 flex-none text-[#737373]" />
                              <a
                                href={row.url}
                                target="_blank"
                                rel="noreferrer"
                                className="break-all text-[13px] text-black hover:underline"
                              >
                                {displayUrl(row.url)}
                              </a>
                              <ExternalLink aria-hidden className="mt-1 h-3 w-3 flex-none text-[#737373]" />
                            </div>
                          </td>
                          <td className="px-3 py-3 text-[13px] capitalize text-[#525252]">{row.link_type}</td>
                          <td className="px-3 py-3 text-[13px]">
                            {status.pill ? (
                              <span className="rounded-[3px] border border-black bg-black px-2 py-0.5 font-medium text-white">
                                {status.text}
                              </span>
                            ) : (
                              <span className="text-[#525252]">{status.text}</span>
                            )}
                          </td>
                          <td className="px-3 py-3 text-right text-[13px] text-[#525252]">{row.pages_affected}</td>
                          <td className="py-3 pl-3 pr-5 text-right">
                            <button
                              type="button"
                              onClick={() => void ignoreLink(row)}
                              className="inline-flex items-center gap-1.5 rounded-[3px] border border-black bg-white px-3 py-1.5 text-[13px] font-semibold text-black hover:bg-[#fafafa]"
                            >
                              <X aria-hidden className="h-3.5 w-3.5" /> Ignore link
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </Fragment>
                ))}
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={6} className="px-5 py-10 text-center text-sm text-[#737373]">
                      {rows.length === 0
                        ? "No broken links were found in the latest scan."
                        : "No links match the current filters."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>

            <Pagination pageCount={pageCount} current={current} onPage={setPage} />
          </div>
        )}
      </section>
    </div>
  );
}

function PagesPanel({
  pages,
  countLabel,
  onInspect,
}: {
  pages: AffectedPage[];
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
