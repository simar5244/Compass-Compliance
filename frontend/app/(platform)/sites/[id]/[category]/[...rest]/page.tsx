"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ChecksTable } from "@/components/platform/site/ChecksTable";
import { useSiteCategory, useSiteRestSegments } from "@/components/platform/site/useSiteCategory";
import { getModuleHistory, getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";
import { bandLabel } from "@/components/platform/ui";

function slugify(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function titleFromSlug(slug: string): string {
  const words = slug.replace(/-/g, " ").trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function categoryLabel(category: string): string {
  if (category === "ux") return "User Experience";
  return category
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function averageScore(scores: (number | null | undefined)[]): number | null {
  const usable = scores.filter((s): s is number => s != null);
  if (!usable.length) return null;
  return Math.round(usable.reduce((a, b) => a + b, 0) / usable.length);
}

/**
 * Sections of a module that are not screens of their own. Each one resolves to
 * the module's checks for that subcategory when the engine records it; when it
 * does not, the screen says so rather than implying the data is on its way.
 */
export default function CategorySectionPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const category = useSiteCategory();
  const rest = useSiteRestSegments();
  const slug = rest.join("/");
  const requestKey = `${params.id}:${category}:${slug}`;
  const [loaded, setLoaded] = useState<{
    key: string;
    checks: SiteCheckRow[] | null;
    isModule: boolean;
    error: string | null;
  }>({ key: "", checks: null, isModule: false, error: null });
  const [series, setSeries] = useState<{ at: string; score: number }[]>([]);

  useEffect(() => {
    let cancelled = false;
    getSiteChecksFull(params.id, slug)
      .then((r) => (r.checks.length ? { result: r, isModule: true } : Promise.reject(new Error("empty"))))
      .catch(() =>
        getSiteChecksFull(params.id, category).then((r) => ({ result: r, isModule: false })),
      )
      .then(({ result, isModule }) => {
        if (!cancelled) setLoaded({ key: requestKey, checks: result.checks, isModule, error: null });
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, checks: null, isModule: false,
            error: e instanceof Error ? e.message : "Failed to load this section",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, category, slug, requestKey]);

  useEffect(() => {
    if (!isModuleSlug(slug)) {
      setSeries([]);
      return;
    }
    let cancelled = false;
    getModuleHistory(params.id, slug)
      .then((r) => {
        if (!cancelled) setSeries(r.points.map((p) => ({ at: p.at, score: p.score })));
      })
      .catch(() => {
        if (!cancelled) setSeries([]);
      });
    return () => { cancelled = true; };
  }, [params.id, slug]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const checks = fresh?.checks ?? null;
  const isModule = fresh?.isModule ?? false;
  const error = fresh?.error ?? null;

  const matching = useMemo(() => {
    const rows = checks ?? [];
    if (isModule) return rows;
    return rows.filter((check) => check.subcategory && slugify(check.subcategory) === slug);
  }, [checks, slug, isModule]);

  const title = titleFromSlug(slug || category);
  const parentLabel = categoryLabel(category);
  const moduleScore = useMemo(
    () => averageScore(matching.map((check) => check.check_score)),
    [matching],
  );
  const openIssues = useMemo(
    () => matching.reduce((sum, check) => sum + (check.issues ?? 0), 0),
    [matching],
  );
  const latestTrend = series.at(-1)?.score ?? null;

  if (error) {
    return (
      <div className="bg-white px-6 py-12 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">{parentLabel}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <div className="mt-8 border border-[#e5e5e5] bg-[#fafafa] px-5 py-6">
          <p className="text-sm text-[#525252]">{error}</p>
        </div>
      </div>
    );
  }

  if (!checks) return <CompassLoader fullPage label={`Loading ${title.toLowerCase()}…`} />;

  if (matching.length === 0) {
    return (
      <div className="light-theme bg-white text-black">
        <section className="px-6 py-10 lg:px-12 lg:py-14">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">{parentLabel}</p>
          <h1 className="mt-3 max-w-[16ch] text-[40px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[56px]">
            {title}
          </h1>
          <section className="mt-8 max-w-2xl border border-[#e5e5e5] bg-[#fafafa] p-8">
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">No matching checks</p>
            <p className="mt-3 text-sm leading-6 text-[#525252]">
              No check in {parentLabel} reports on {title.toLowerCase()}, so there is nothing to show
              here. This section will fill in on its own once a check covering it runs.
            </p>
            <button
              type="button"
              onClick={() => router.push(`/sites/${params.id}/${category}`)}
              className="mt-6 bg-black px-5 py-2.5 text-sm font-semibold text-white hover:bg-[#262626]"
            >
              Back to {parentLabel}
            </button>
          </section>
        </section>
      </div>
    );
  }

  return (
    <div className="light-theme bg-white text-black">
      <section className="grid gap-8 border-b border-[#e5e5e5] px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:px-12 lg:py-14">
        <div className="flex flex-col justify-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">{parentLabel}</p>
          <h1 className="mt-3 max-w-[16ch] text-[40px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[56px]">
            {title}
          </h1>
          <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-[#525252]">
            The {parentLabel.toLowerCase()} checks that report on {title.toLowerCase()}, in the order
            they are reported.
          </p>
        </div>

        <div className="grid gap-3">
          <div className="flex min-h-[180px] flex-col justify-between rounded-[3px] bg-black p-6 text-white lg:min-h-[200px] lg:p-7">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                {bandLabel(isModule ? latestTrend : moduleScore)}
              </p>
              <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
                {isModule
                  ? latestTrend == null ? "—" : Math.round(latestTrend)
                  : moduleScore == null ? "—" : moduleScore}
              </p>
            </div>
            <div>
              <p className="text-lg font-semibold lg:text-xl">{isModule ? "Section score" : "Module score"}</p>
              <p className="mt-1 text-sm text-white/60">Latest completed scan</p>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="flex min-h-[108px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Checks</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums lg:text-3xl">
                {matching.length.toLocaleString("en-US")}
              </p>
            </div>
            <div className="flex min-h-[108px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Open issues</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums lg:text-3xl">
                {openIssues.toLocaleString("en-US")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-6 py-12 lg:px-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Section checks</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Checks</h2>
          </div>
          <p className="text-sm text-[#737373]">{matching.length} total</p>
        </div>
        <ChecksTable
          siteId={params.id}
          checks={matching}
          onRowClick={(checkId) => router.push(`/sites/${params.id}/checks/${checkId}`)}
        />
      </section>
    </div>
  );
}

function isModuleSlug(slug: string): boolean {
  return slug.includes("-optimization") || slug === "web-vitals";
}
