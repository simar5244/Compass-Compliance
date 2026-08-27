"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowUpRight, ExternalLink } from "lucide-react";
import { artifactUrl, getScan, type ScanSummary } from "@/lib/api";
import { getSite, getSiteChecksFull, scanNow, type SiteCheckRow, type SiteDetail } from "@/lib/auth";
import { bandLabel, relativeTime } from "@/components/platform/ui";
import { ListPagination, useListPagination } from "@/components/platform/ListPagination";

const IN_PROGRESS = new Set(["pending", "crawling", "scoring"]);

function hostLabel(rootUrl: string | undefined): string | null {
  try {
    return new URL(rootUrl ?? "").hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function averageScore(scores: (number | null | undefined)[]): number | null {
  const usable = scores.filter((s): s is number => s != null);
  if (!usable.length) return null;
  return Math.round(usable.reduce((a, b) => a + b, 0) / usable.length);
}

const CHECKS_PAGE_SIZE = 5;

function ChecksBoard({
  checks,
  onOpen,
}: {
  checks: SiteCheckRow[];
  onOpen: (checkId: string) => void;
}) {
  const sorted = useMemo(
    () => [...checks].sort((a, b) => (b.issues ?? 0) - (a.issues ?? 0)),
    [checks],
  );

  const {
    page: safePage,
    setPage,
    viewAll,
    setViewAll,
    pageCount,
    visible,
    showPager,
  } = useListPagination(sorted, CHECKS_PAGE_SIZE);

  return (
    <section className="border-t border-[#e5e5e5] bg-white px-6 py-12 lg:px-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">All checks</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Issues ranked by volume</h2>
        </div>
        <p className="text-sm text-[#737373]">{sorted.length} total</p>
      </div>

      <div className={`border border-[#e5e5e5] ${viewAll ? "" : "max-h-[420px] overflow-y-auto"}`}>
        {visible.map((c) => (
          <button
            type="button"
            key={c.check_id}
            onClick={() => onOpen(c.check_id)}
            className="flex w-full items-center justify-between gap-4 border-b border-[#e5e5e5] px-5 py-4 text-left last:border-b-0 hover:bg-[#fafafa]"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">
                {c.display_name || c.criterion_name || c.check_id}
              </p>
              <p className="mt-1 text-[11px] uppercase tracking-[0.12em] text-[#737373]">{c.category}</p>
            </div>
            <span className="shrink-0 text-lg font-semibold tabular-nums">{c.issues ?? 0}</span>
          </button>
        ))}
        {visible.length === 0 && (
          <p className="px-5 py-10 text-sm text-[#737373]">Run a scan to populate checks.</p>
        )}
      </div>

      {showPager && (
        <ListPagination
          className="mt-4"
          page={safePage}
          pageCount={pageCount}
          onPage={setPage}
          viewAll={viewAll}
          onViewAllChange={setViewAll}
          totalItems={sorted.length}
        />
      )}
    </section>
  );
}

export default function SiteOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [site, setSite] = useState<SiteDetail | null>(null);
  const [checks, setChecks] = useState<SiteCheckRow[]>([]);
  const [activeScan, setActiveScan] = useState<ScanSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scanning, setScanning] = useState(false);

  const siteId = params.id;

  async function reload() {
    const s = await getSite(siteId);
    setSite(s);
    const c = await getSiteChecksFull(siteId);
    setChecks(c.checks);
    return { site: s, checks: c };
  }

  useEffect(() => {
    reload().catch((e) => {
      const msg = e instanceof Error ? e.message : String(e);
      setError(
        msg.includes("Failed to fetch")
          ? "Failed to fetch site data. The API did not respond. Check that the backend service is running and reachable from the app."
          : msg,
      );
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [siteId]);

  useEffect(() => {
    const latestScanId: string | null = site?.latest_scan_id ?? null;
    if (!latestScanId) return;
    const scanId: string = latestScanId;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout>;
    async function tick() {
      try {
        const s = await getScan(scanId);
        if (cancelled) return;
        if (IN_PROGRESS.has(s.status)) {
          setActiveScan(s);
          timer = setTimeout(tick, 1700);
        } else {
          setActiveScan(null);
          await reload();
        }
      } catch {
        if (!cancelled) setActiveScan(null);
      }
    }
    tick();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [site?.latest_scan_id]);

  const pages = site?.pages ?? 0;
  const docs = site?.documents ?? 0;
  const partial = site?.settings?.max_pages != null && pages >= site.settings.max_pages;

  const cats = useMemo(
    () => [
      {
        key: "content",
        label: "Content",
        desc: "Voice, grammar, links, and readability",
        score: site?.category_scores?.content ?? null,
      },
      {
        key: "accessibility",
        label: "Accessibility",
        desc: "WCAG 2.2 across every captured page",
        score: site?.category_scores?.accessibility ?? null,
      },
      {
        key: "marketing",
        label: "Marketing",
        desc: "Message, SEO, and content depth",
        score: site?.category_scores?.marketing ?? null,
      },
      {
        key: "ux",
        label: "Experience",
        desc: "Speed, vitals, and how it feels to use",
        score: site?.category_scores?.ux ?? null,
      },
    ],
    [site],
  );

  const overall = useMemo(() => averageScore(cats.map((c) => c.score)), [cats]);
  const domain = hostLabel(site?.root_url);
  const openIssues = checks.reduce((n, c) => n + (c.issues ?? 0), 0);

  const desktop =
    site?.latest_scan_id && site.latest_desktop_screenshot_ref
      ? artifactUrl(site.latest_scan_id, site.latest_desktop_screenshot_ref)
      : null;
  const mobile =
    site?.latest_scan_id && site.latest_mobile_screenshot_ref
      ? artifactUrl(site.latest_scan_id, site.latest_mobile_screenshot_ref)
      : null;

  async function doScanNow() {
    if (scanning) return;
    setScanning(true);
    setError(null);
    try {
      const { scan_id } = await scanNow(siteId);
      const s = await getScan(scan_id);
      setActiveScan(s);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scan failed to start");
    } finally {
      setScanning(false);
    }
  }

  if (error) {
    return (
      <div className="px-8 py-10">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!site) return <CompassLoader fullPage label="Loading site…" />;

  const [lead, ...rest] = cats;

  return (
    <div className="light-theme bg-white text-black">
      <section className="grid min-w-0 gap-6 bg-white px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-14">
        <div className="flex flex-col justify-center">
          <h1 className="max-w-[16ch] text-[48px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[72px]">
            {site.name}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-5 text-sm text-[#525252]">
            {domain && (
              <a
                href={site.root_url}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 font-medium text-black hover:underline"
              >
                {domain}
                <ExternalLink aria-hidden className="h-3.5 w-3.5" />
              </a>
            )}
            <span>Scanned {relativeTime(site.last_scanned_at ?? null)}</span>
          </div>
          <div className="mt-10 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={doScanNow}
              disabled={!!activeScan || scanning}
              className="bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-[#262626] disabled:opacity-50"
            >
              {activeScan ? "Scanning now" : "Run a new scan"}
            </button>
            <button
              type="button"
              onClick={() => router.push(`/sites/${siteId}/accessibility`)}
              className="border border-black px-6 py-3 text-sm font-medium hover:bg-[#f5f5f5]"
            >
              Open accessibility
            </button>
          </div>
          {activeScan && (
            <p className="mt-6 text-sm text-[#525252]" role="status" aria-live="polite">
              {activeScan.status} · {activeScan.pages_crawled} scanned · {activeScan.pages_queued} queued
            </p>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-8 lg:col-start-2">
          <div className="relative w-full min-w-0">
            <div className="w-[86.9565%] origin-top-left scale-[1.15]">
              {desktop ? (
                <div className="overflow-hidden border border-[#e5e5e5] bg-[#f5f5f5]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={desktop}
                    alt={`Desktop view of ${site.name}`}
                    className="aspect-[16/10] w-full object-cover object-top"
                  />
                </div>
              ) : (
                <div className="flex aspect-[16/10] items-center justify-center border border-dashed border-[#e5e5e5] text-sm text-[#737373]">
                  Screenshot appears after the first scan
                </div>
              )}
              {mobile && (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={mobile}
                  alt={`Mobile view of ${site.name}`}
                  className="absolute bottom-6 right-4 hidden h-[11.5rem] w-[5.75rem] border-2 border-black object-cover object-top lg:block"
                />
              )}
            </div>
          </div>

          <div className="grid w-full min-w-0 grid-cols-4 gap-3 border border-[#e5e5e5] p-5">
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Score</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{overall == null ? "—" : overall}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Pages</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{pages.toLocaleString("en-US")}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Docs</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{docs.toLocaleString("en-US")}</p>
            </div>
            <div>
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Open</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">{openIssues.toLocaleString("en-US")}</p>
            </div>
          </div>
        </div>
      </section>

      <p className="px-6 text-[12px] text-[#737373] lg:px-12">
        {partial
          ? `Coverage is capped at the first ${site.settings?.max_pages?.toLocaleString("en-US")} pages.`
          : "This looks like the full site surface Compass could reach."}
      </p>

      <section className="grid grid-cols-1 gap-3 px-6 py-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:px-12">
        {lead && (
          <button
            type="button"
            onClick={() => router.push(`/sites/${siteId}/${lead.key}`)}
            className="group flex min-h-[220px] flex-col justify-between bg-black p-6 text-left text-white lg:min-h-[240px] lg:p-7"
          >
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{bandLabel(lead.score)}</p>
              <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
                {lead.score == null ? "—" : Math.round(lead.score)}
              </p>
            </div>
            <div className="flex items-end justify-between gap-3">
              <div>
                <p className="text-lg font-semibold lg:text-xl">{lead.label}</p>
                <p className="mt-1 max-w-sm text-sm text-white/60">{lead.desc}</p>
              </div>
              <ArrowUpRight className="h-5 w-5 shrink-0 opacity-60 transition group-hover:opacity-100" />
            </div>
          </button>
        )}
        {rest.map((c) => (
          <button
            type="button"
            key={c.key}
            onClick={() => router.push(`/sites/${siteId}/${c.key}`)}
            className="group flex min-h-[220px] flex-col justify-between border border-[#e5e5e5] bg-[#fafafa] p-6 text-left hover:border-black lg:min-h-[240px]"
          >
            <p className="text-[32px] font-semibold leading-none tracking-[-0.05em] lg:text-[36px]">
              {c.score == null ? "—" : Math.round(c.score)}
            </p>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{bandLabel(c.score)}</p>
              <p className="mt-2 text-lg font-semibold">{c.label}</p>
              <p className="mt-1 text-sm text-[#737373]">{c.desc}</p>
            </div>
          </button>
        ))}
      </section>

      <ChecksBoard
        checks={checks}
        onOpen={(checkId) => router.push(`/sites/${siteId}/checks/${checkId}`)}
      />
    </div>
  );
}
