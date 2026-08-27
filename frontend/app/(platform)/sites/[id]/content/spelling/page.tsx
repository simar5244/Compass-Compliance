"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { Fragment, useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Search, SlidersHorizontal, MoreHorizontal } from "lucide-react";

import { getCheckWords, type SpellingWordRow } from "@/lib/auth";
import { rollUpPages, type AffectedPage } from "@/components/platform/site/AffectedPagesTab";

const TABS = ["Words", "Pages"] as const;

const INTRO =
  "Apparent spelling errors are highlighted here. You should review these manually and either " +
  "correct any issues or mark them as approved. Words are grouped by how confident the check is: " +
  "likely errors and incorrect casing are almost always worth fixing, while potential errors and " +
  "words detected as another language are often names, jargon or deliberate foreign-language text.";

const PAGE_SIZE = 10;

/** Presentation order and wording for the buckets the check assigns. */
const GROUPS = [
  { key: "likely", label: "Likely spelling errors", tone: "error" },
  { key: "incorrect_case", label: "Incorrect case", tone: "error" },
  { key: "different_language", label: "Different language", tone: "warning" },
  { key: "potential", label: "Potential spelling errors", tone: "warning" },
] as const;

function GroupIcon({ tone }: { tone: "error" | "warning" }) {
  if (tone === "error") {
    return (
      <span
        aria-hidden
        className="inline-flex h-5 w-5 flex-none items-center justify-center rounded-full bg-black text-[13px] font-bold leading-none text-white"
      >
        !
      </span>
    );
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-5 w-5 flex-none items-center justify-center border border-[#a3a3a3] bg-[#fafafa] text-[11px] font-bold leading-none text-[#525252] rounded-[3px]"
    >
      !
    </span>
  );
}

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

export default function SpellingPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [loaded, setLoaded] = useState<{
    key: string;
    scanId: string | null;
    words: SpellingWordRow[] | null;
    error: string | null;
  }>({ key: "", scanId: null, words: null, error: null });
  const [search, setSearch] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [page, setPage] = useState(0);
  const [tab, setTab] = useState<(typeof TABS)[number]>("Words");

  const requestKey = params.id;
  const fresh = loaded.key === requestKey ? loaded : null;
  const scanId = fresh?.scanId ?? null;
  const words = fresh?.words ?? null;
  const error = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    getCheckWords(params.id, "spelling")
      .then((r) => {
        if (!cancelled) setLoaded({ key: requestKey, scanId: r.scan_id, words: r.items, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, scanId: null, words: null,
            error: e instanceof Error ? e.message : "Failed to load spelling results",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const rows = useMemo(() => words ?? [], [words]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.word.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const pageCount = Math.max(1, Math.ceil(visible.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = visible.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  /** Rows on this page, split into their groups and keeping the server order. */
  const sections = useMemo(() => {
    return GROUPS.map((group) => ({
      ...group,
      items: slice.filter((row) => row.category === group.key),
    })).filter((group) => group.items.length > 0);
  }, [slice]);

  /** One row per page, counting the words flagged on it. */
  const affectedPages = useMemo(
    () =>
      rollUpPages(
        // Paired server-side: page_ids/page_urls/issue_ids each group
        // differently, so zipping them by index links the wrong issue.
        rows.flatMap((row) => row.pages ?? []),
      ),
    [rows],
  );

  const likelyCount = useMemo(
    () => rows.filter((row) => row.category === "likely" || row.category === "incorrect_case").length,
    [rows],
  );

  function inspectPage(target: AffectedPage) {
    if (!scanId) return;
    const from = `/sites/${params.id}/content/spelling`;
    const issue = target.issue_id ? `&issue=${target.issue_id}` : "";
    router.push(`/scans/${scanId}/inspect?page=${target.page_id}${issue}&from=${encodeURIComponent(from)}`);
  }

  function inspectWord(row: SpellingWordRow) {
    if (!scanId || !row.example_page_id) return;
    const from = `/sites/${params.id}/content/spelling`;
    const issue = row.example_issue_id ? `&issue=${row.example_issue_id}` : "";
    router.push(
      `/scans/${scanId}/inspect?page=${row.example_page_id}${issue}&from=${encodeURIComponent(from)}`,
    );
  }

  if (error) return <div className="bg-white p-8 text-black">{error}</div>;
  if (!words) return <CompassLoader fullPage label="Loading spelling results…" />;

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Content</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">Check and fix misspellings</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">{INTRO}</p>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Words</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{rows.length}</p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Likely errors</p>
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
          <PagesPanel pages={affectedPages} countLabel="Words" onInspect={inspectPage} />
        ) : (
          <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
            <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
              <h2 className="text-lg font-semibold text-black">Words</h2>
              <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
                {visible.length}
              </span>
              <div className="ml-auto flex items-center gap-2">
                {searchOpen && (
                  <input
                    autoFocus
                    value={search}
                    onChange={(event) => { setSearch(event.target.value); setPage(0); }}
                    placeholder="Search words"
                    aria-label="Search words"
                    className="h-9 w-[200px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none placeholder:text-[#a3a3a3] focus:border-black rounded-[3px]"
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
                  <th scope="col" className="px-3 py-3 font-medium">Word</th>
                  <th scope="col" className="px-3 py-3 font-medium">Suggestions</th>
                  <th scope="col" className="px-3 py-3 font-medium">Language</th>
                  <th scope="col" className="w-[110px] py-3 pl-3 pr-5 text-right font-medium">Quantity</th>
                </tr>
              </thead>
              <tbody>
                {sections.map((group) => (
                  <Fragment key={group.key}>
                    <tr className="border-b border-[#e5e5e5] bg-[#fafafa]">
                      <td colSpan={5} className="px-5 py-2.5">
                        <span className="flex items-center gap-2 text-[13px] font-semibold text-black">
                          <GroupIcon tone={group.tone} /> {group.label}
                        </span>
                      </td>
                    </tr>
                    {group.items.map((row) => (
                      <tr key={`${group.key}:${row.word}`} className="border-b border-[#e5e5e5] last:border-b-0 hover:bg-[#fafafa]">
                        <td className="py-3 pl-5">
                          <button
                            type="button"
                            onClick={() => inspectWord(row)}
                            disabled={!row.example_page_id}
                            aria-label={`Inspect ${row.word}`}
                            className="grid h-8 w-8 place-items-center border border-black bg-black text-white hover:bg-[#262626] disabled:opacity-40 rounded-[3px]"
                          >
                            <Search aria-hidden className="h-4 w-4" />
                          </button>
                        </td>
                        <td className="px-3 py-3">
                          <button
                            type="button"
                            onClick={() => inspectWord(row)}
                            disabled={!row.example_page_id}
                            className="text-[14px] font-medium text-black underline decoration-[#737373] decoration-wavy underline-offset-4 hover:decoration-black disabled:no-underline"
                          >
                            {row.word}
                          </button>
                        </td>
                        <td className="px-3 py-3 text-[14px] text-[#525252]">
                          {row.suggestions.length ? row.suggestions.join(", ") : ""}
                        </td>
                        <td className="px-3 py-3 text-[14px] text-[#525252]">{row.language || "Unknown"}</td>
                        <td className="py-3 pl-3 pr-5 text-right text-[14px] tabular-nums text-[#525252]">{row.quantity}</td>
                      </tr>
                    ))}
                  </Fragment>
                ))}
                {slice.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-5 py-10 text-center text-sm text-[#737373]">
                      {rows.length === 0
                        ? "No spelling issues were found in the latest scan."
                        : `No words match “${search}”.`}
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
