"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { getDashboard, getSite, type Dashboard, type SiteCard as SiteCardT } from "@/lib/auth";
import { ListPagination, useListPagination } from "@/components/platform/ListPagination";
import { artifactUrl } from "@/lib/api";
import { CompassLoader } from "@/components/CompassLoader";
import { useUser } from "@/components/platform/PlatformShell";
import { relativeTime } from "@/components/platform/ui";
import { Modal } from "@/components/platform/Modal";
import { AddSiteForm } from "@/components/platform/AddSiteForm";
import { ScanControl } from "@/components/platform/ScanControl";

const PAGE_SIZE = 10;

const IconSite = (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
    <circle cx="12" cy="12" r="9" />
    <path d="M3 12h18M12 3c2.5 2.5 2.5 15 0 18M12 3c-2.5 2.5-2.5 15 0 18" />
  </svg>
);

type SortKey = "recent" | "name" | "score";

const SORT_LABELS: Record<SortKey, string> = {
  recent: "Recently scanned",
  name: "Name",
  score: "Score",
};

function hostLabel(rootUrl: string): string {
  try {
    return new URL(rootUrl).hostname.replace(/^www\./, "");
  } catch {
    return rootUrl;
  }
}

function scoreLabel(score: number | null): string {
  return score == null ? "—" : `${Math.round(score)}`;
}

/**
 * The dashboard payload has no screenshot, so each card pulls the site's latest
 * desktop capture from the existing site endpoint. One request per card.
 */
function useThumbnails(sites: SiteCardT[]) {
  const [thumbs, setThumbs] = useState<Record<string, string | null>>({});
  const ids = sites.map((site) => site.id).join(",");

  useEffect(() => {
    let cancelled = false;
    Promise.all(
      sites.map(async (site) => {
        try {
          const detail = await getSite(site.id);
          const ref = detail.latest_desktop_screenshot_ref;
          const scanId = detail.latest_scan_id;
          return [site.id, ref && scanId ? artifactUrl(scanId, ref) : null] as const;
        } catch {
          return [site.id, null] as const;
        }
      }),
    ).then((entries) => {
      if (!cancelled) setThumbs(Object.fromEntries(entries));
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids]);

  return thumbs;
}

function SiteRow({
  site,
  thumbnail,
  onOpen,
  onScanComplete,
}: {
  site: SiteCardT;
  thumbnail: string | null | undefined;
  onOpen: () => void;
  onScanComplete: () => void;
}) {
  const [failed, setFailed] = useState(false);
  const openCount = (site.concerns?.error ?? 0) + (site.concerns?.warning ?? 0);

  return (
    <article className="overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white">
      <div className="flex flex-col sm:flex-row">
        <button
          type="button"
          onClick={onOpen}
          className="flex min-w-0 flex-1 text-left hover:bg-[#fafafa] sm:hover:bg-[#f5f5f5]"
          aria-label={site.name}
        >
          <div className="relative h-[88px] w-full shrink-0 overflow-hidden border-b border-[#e5e5e5] bg-[#f5f5f5] sm:h-[104px] sm:w-[104px] sm:border-b-0 sm:border-r">
            {thumbnail && !failed ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={thumbnail}
                alt=""
                className="h-full w-full object-cover object-top"
                onError={() => setFailed(true)}
              />
            ) : (
              <div className="grid h-full w-full place-items-center text-[#737373]">
                {thumbnail === undefined ? (
                  <CompassLoader label="Loading screenshot…" size="sm" />
                ) : (
                  <span className="px-2 text-center text-[10px] uppercase tracking-[0.12em]">No screenshot</span>
                )}
              </div>
            )}
          </div>

          <div className="min-w-0 flex-1 px-4 py-4 sm:px-5">
            <h2 className="truncate text-[17px] font-semibold leading-6 tracking-tight text-black">{site.name}</h2>
            <p className="mt-1 truncate text-[12px] text-[#737373]">{hostLabel(site.root_url)}</p>
            <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-[12px] text-[#525252]">
              <span>{site.pages ?? "—"} pages</span>
              <span>Scanned {relativeTime(site.last_scanned_at)}</span>
              <span className="tabular-nums">Score {scoreLabel(site.overall_score)}</span>
              <span>{openCount} open</span>
            </div>
          </div>
        </button>

        <div className="flex items-center justify-end border-t border-[#e5e5e5] px-4 py-3 sm:border-l sm:border-t-0 sm:px-5">
          <ScanControl siteId={site.id} activeScan={site.active_scan} onComplete={onScanComplete} />
        </div>
      </div>
    </article>
  );
}

export default function WebsitesPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const user = useUser();
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [sort, setSort] = useState<SortKey>("recent");
  const isAdmin = user?.role === "admin";

  // The nav's global search hands its query over through the URL. Tracking which
  // query the local edit belongs to lets a new one take over without an effect.
  const navQuery = searchParams.get("q") ?? "";
  const [typed, setTyped] = useState({ forQuery: navQuery, value: navQuery });
  const search = typed.forQuery === navQuery ? typed.value : navQuery;
  const setSearch = (value: string) => setTyped({ forQuery: navQuery, value });

  const reload = () =>
    getDashboard()
      .then(setData)
      .catch((e) => {
        const msg = e instanceof Error ? e.message : String(e);
        setError(
          msg.includes("Failed to fetch")
            ? "Failed to fetch dashboard data. The API did not respond. Check that the backend service is running and reachable from the app."
            : msg
        );
      });
  useEffect(() => { reload(); }, []);

  const sites = useMemo(() => data?.sites ?? [], [data]);
  const thumbnails = useThumbnails(sites);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const filtered = q
      ? sites.filter((site) => `${site.name} ${site.root_url}`.toLowerCase().includes(q))
      : sites;
    const ordered = [...filtered];
    if (sort === "name") ordered.sort((a, b) => a.name.localeCompare(b.name));
    else if (sort === "score") ordered.sort((a, b) => (b.overall_score ?? -1) - (a.overall_score ?? -1));
    else ordered.sort((a, b) => (b.last_scanned_at ?? "").localeCompare(a.last_scanned_at ?? ""));
    return ordered;
  }, [sites, search, sort]);

  const {
    page: safePage,
    setPage,
    viewAll,
    setViewAll,
    pageCount,
    visible: paged,
    showPager,
  } = useListPagination(visible, PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [search, sort, sites.length, setPage]);

  if (error) {
    return (
      <div className="bg-white px-6 py-10 text-black lg:px-12">
        <p className="text-sm text-[#525252]">{error}</p>
      </div>
    );
  }
  if (!data) return <WebsitesSkeleton />;

  const addSiteModal = (
    <Modal open={addOpen} onClose={() => setAddOpen(false)} title="Add a site to monitor">
      <AddSiteForm onDone={() => { setAddOpen(false); reload(); }} />
    </Modal>
  );

  if (sites.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-6 py-24 text-center">
        <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-[3px] border border-[#e5e5e5] bg-[#f5f5f5] text-[#737373]">{IconSite}</div>
        <h1 className="mb-2 text-xl font-semibold tracking-tight text-black">{isAdmin ? "No websites yet" : "No websites assigned yet"}</h1>
        <p className="mb-5 text-sm text-[#737373]">{isAdmin ? "Add a website to start monitoring its compliance over time." : "Ask an admin to assign you a website, and it will appear here with its latest scores and issues."}</p>
        {isAdmin && <button onClick={() => setAddOpen(true)} className="rounded-[3px] bg-black px-4 py-2 text-sm font-semibold text-white hover:bg-[#525252]">+ Add a website</button>}
        {addSiteModal}
      </div>
    );
  }

  const totals = data.totals;

  return (
    <div className="light-theme min-h-screen bg-white text-black">
      {addSiteModal}

      <section className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-14">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Workspace</p>
            <h1 className="mt-3 max-w-[12ch] text-[40px] font-semibold leading-[0.95] tracking-[-0.04em] lg:text-[56px]">
              Websites
            </h1>
            <p className="mt-4 max-w-xl text-sm leading-6 text-[#525252]">
              Assigned properties and their latest scan. Open a site to work through checks, pages, and issues.
            </p>
          </div>
          {isAdmin && (
            <button
              type="button"
              onClick={() => setAddOpen(true)}
              className="rounded-[3px] bg-black px-5 py-3 text-sm font-semibold text-white hover:bg-[#525252]"
            >
              + Add website
            </button>
          )}
        </div>

        <div className="mt-10 grid max-w-2xl grid-cols-3 gap-3 rounded-[3px] border border-[#e5e5e5] p-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Sites</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{totals.sites}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Errors</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{totals.errors}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Warnings</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{totals.warnings}</p>
          </div>
        </div>
      </section>

      <section className="px-6 py-10 lg:px-12">
        <div className="mb-6 flex flex-wrap items-end gap-4">
          <label className="block w-full max-w-[300px]">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-[#737373]">Search</span>
            <input
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Search all websites"
              aria-label="Search all websites"
              className="h-11 w-full rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none placeholder:text-[#737373] focus:border-black"
            />
          </label>
          <label className="block w-full max-w-[200px]">
            <span className="mb-1.5 block text-[11px] uppercase tracking-[0.14em] text-[#737373]">Order by</span>
            <select
              value={sort}
              onChange={(event) => setSort(event.target.value as SortKey)}
              aria-label="Order by"
              className="h-11 w-full rounded-[3px] border border-[#e5e5e5] bg-white px-3 text-sm text-black outline-none focus:border-black"
            >
              {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
                <option key={key} value={key}>{SORT_LABELS[key]}</option>
              ))}
            </select>
          </label>
          <p className="ml-auto text-sm text-[#737373]">
            {visible.length} site{visible.length === 1 ? "" : "s"}
          </p>
        </div>

        {visible.length === 0 ? (
          <p className="text-sm text-[#737373]">No websites match “{search}”.</p>
        ) : (
          <>
            <div className="flex flex-col gap-3">
              {paged.map((site) => (
                <SiteRow
                  key={site.id}
                  site={site}
                  thumbnail={thumbnails[site.id]}
                  onOpen={() => router.push(`/sites/${site.id}`)}
                  onScanComplete={reload}
                />
              ))}
            </div>

            {showPager && (
              <ListPagination
                className="mt-6"
                page={safePage}
                pageCount={pageCount}
                onPage={setPage}
                viewAll={viewAll}
                onViewAllChange={setViewAll}
                totalItems={visible.length}
              />
            )}
          </>
        )}
      </section>
    </div>
  );
}

function WebsitesSkeleton() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-white">
      <CompassLoader label="Loading websites…" size="lg" />
    </div>
  );
}
