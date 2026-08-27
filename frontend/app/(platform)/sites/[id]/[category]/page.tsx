"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useSiteCategory } from "@/components/platform/site/useSiteCategory";

import { ChecksTable } from "@/components/platform/site/ChecksTable";
import { bandLabel, relativeTime } from "@/components/platform/ui";
import {
  getSite,
  getSiteChecksFull,
  type SiteCheckRow,
  type SiteDetail,
} from "@/lib/auth";

const MODULES: Record<string, { title: string; intro: string }> = {
  content: {
    title: "Content",
    intro:
      "Everything a visitor reads: spelling, grammar, reading level, the links between pages and " +
      "the documents you publish. Content problems are usually quick to fix and are the ones your " +
      "audience notices first.",
  },
  accessibility: {
    title: "Accessibility",
    intro:
      "WCAG 2.2 checks run against every page. Failures here stop some people using the site at " +
      "all, so they carry the most weight. Checks that need a human decision are listed as review " +
      "items and are not scored.",
  },
  marketing: {
    title: "Marketing",
    intro:
      "How well each page presents itself to search engines and to people sharing it: titles, " +
      "descriptions, headings, canonical URLs, sitemaps and social preview data.",
  },
  ux: {
    title: "User Experience",
    intro:
      "Structure, navigation, media and interaction signals — the things that decide whether a " +
      "visitor can find what they came for and act on it without friction.",
  },
  privacy: {
    title: "Privacy",
    intro:
      "Cookies, consent, transport security and the third-party technologies your pages load. " +
      "These are checked from the response headers and the page's own requests.",
  },
  policies: {
    title: "Policies",
    intro:
      "Pages matched against the policy language your organisation cares about. These are matches " +
      "to review rather than failures to fix, so this module reports findings instead of a score.",
  },
  "ttu-compliance": {
    title: "TTU Compliance",
    intro: "Texas Tech University compliance checks for accessibility, privacy, safety, and content health.",
  },
  "brand-standards": {
    title: "Brand Standards",
    intro: "TTU visual identity checks for colors, typography, logos, and components.",
  },
};

function moduleInfo(category: string) {
  return (
    MODULES[category] ?? {
      title: category.charAt(0).toUpperCase() + category.slice(1),
      intro: "Checks in this module, in the order they are reported.",
    }
  );
}

function averageScore(scores: (number | null | undefined)[]): number | null {
  const usable = scores.filter((s): s is number => s != null);
  if (!usable.length) return null;
  return Math.round(usable.reduce((a, b) => a + b, 0) / usable.length);
}

export default function CategoryOverviewPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const siteId = params.id;
  const category = useSiteCategory();
  const requestKey = `${siteId}:${category}`;

  // Keyed by the request it answers, so switching module shows a load rather
  // than the previous module's checks under the new module's name.
  const [loaded, setLoaded] = useState<{
    key: string;
    site: SiteDetail | null;
    checks: SiteCheckRow[] | null;
    error: string | null;
  }>({ key: "", site: null, checks: null, error: null });

  useEffect(() => {
    let cancelled = false;
    Promise.all([getSite(siteId), getSiteChecksFull(siteId, category)])
      .then(([siteDetail, checkList]) => {
        if (!cancelled) {
          setLoaded({ key: requestKey, site: siteDetail, checks: checkList.checks, error: null });
        }
      })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, site: null, checks: null,
            error: e instanceof Error ? e.message : "Failed to load this module",
          });
        }
      });
    return () => { cancelled = true; };
  }, [siteId, category, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const site = fresh?.site ?? null;
  const checks = fresh?.checks ?? null;
  const error = fresh?.error ?? null;

  const { title, intro } = moduleInfo(category);

  /** Policies reports matches to review, so it has findings but no score. */
  const scored = category !== "policies";
  const findings = useMemo(
    () => (checks ?? []).reduce((sum, check) => sum + (check.issues ?? 0), 0),
    [checks],
  );
  const openChecks = useMemo(
    () => (checks ?? []).filter((check) => (check.issues ?? 0) > 0).length,
    [checks],
  );
  const moduleScore = useMemo(() => {
    if (!scored || !site || !checks) return null;
    const fromSite = site.category_scores?.[category];
    if (fromSite != null) return Math.round(fromSite);
    return averageScore(checks.map((check) => check.check_score));
  }, [scored, site, checks, category]);

  if (error) {
    return (
      <div className="bg-white px-8 py-10 text-black">
        <p className="text-sm text-[#525252]">{error}</p>
      </div>
    );
  }
  if (!site || !checks) {
    return <CompassLoader fullPage label={`Loading ${title.toLowerCase()}…`} />;
  }

  const pages = site.pages ?? 0;

  return (
    <div className="light-theme bg-white text-black">
      <section className="grid gap-8 bg-white px-6 py-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-stretch lg:gap-x-10 lg:px-12 lg:py-14">
        <div className="flex flex-col justify-center">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">{site.name}</p>
          <h1 className="mt-3 max-w-[16ch] text-[48px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[72px]">
            {title}
          </h1>
          <p className="mt-6 max-w-[62ch] text-sm leading-relaxed text-[#525252]">{intro}</p>
          <p className="mt-4 text-sm text-[#737373]">
            Scanned {relativeTime(site.last_scanned_at ?? null)}
          </p>
          <div className="mt-10 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => router.push(`/sites/${siteId}`)}
              className="bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-[#262626]"
            >
              Back to site
            </button>
            <button
              type="button"
              onClick={() => router.push(`/sites/${siteId}/${category}/pages`)}
              className="border border-black px-6 py-3 text-sm font-medium hover:bg-[#f5f5f5]"
            >
              View pages
            </button>
          </div>
        </div>

        <div className="grid gap-3">
          <div className="flex min-h-[180px] flex-col justify-between rounded-[3px] bg-black p-6 text-white lg:min-h-[200px] lg:p-7">
            {scored ? (
              <>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">
                    {bandLabel(moduleScore)}
                  </p>
                  <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
                    {moduleScore == null ? "—" : moduleScore}
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold lg:text-xl">Module score</p>
                  <p className="mt-1 text-sm text-white/60">Latest completed scan</p>
                </div>
              </>
            ) : (
              <>
                <div>
                  <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">To review</p>
                  <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
                    {findings.toLocaleString("en-US")}
                  </p>
                </div>
                <div>
                  <p className="text-lg font-semibold lg:text-xl">
                    {findings === 1 ? "Match" : "Matches"}
                  </p>
                  <p className="mt-1 text-sm text-white/60">Policy language found on pages</p>
                </div>
              </>
            )}
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div className="flex min-h-[108px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Checks</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums lg:text-3xl">
                {checks.length.toLocaleString("en-US")}
              </p>
            </div>
            <div className="flex min-h-[108px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">
                {scored ? "Open" : "Matches"}
              </p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums lg:text-3xl">
                {(scored ? openChecks : findings).toLocaleString("en-US")}
              </p>
            </div>
            <div className="flex min-h-[108px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
              <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Pages</p>
              <p className="text-2xl font-semibold tracking-tight tabular-nums lg:text-3xl">
                {pages.toLocaleString("en-US")}
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e5e5] bg-white px-6 py-12 lg:px-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">
              {scored ? "Module checks" : "Review items"}
            </p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Checks</h2>
          </div>
          <p className="text-sm text-[#737373]">
            {checks.length} {checks.length === 1 ? "check" : "checks"}
            {!scored && (
              <>
                {" · "}
                {findings.toLocaleString("en-US")} {findings === 1 ? "match" : "matches"} to review
              </>
            )}
          </p>
        </div>

        <ChecksTable
          siteId={siteId}
          checks={checks}
          onRowClick={(checkId) => router.push(`/sites/${siteId}/checks/${checkId}`)}
        />
      </section>
    </div>
  );
}
