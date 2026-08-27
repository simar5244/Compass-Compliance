"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { getSitePages, type SitePageRow } from "@/lib/auth";
import { PagesTable, type PagesTableCategory } from "@/components/platform/site/PagesTable";
import { ScoreRing } from "@/components/platform/ui";

function categoryToApi(category: PagesTableCategory): string | undefined {
  if (category === "all") return undefined;
  return category;
}

export default function SiteWidePagesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();

  const [category, setCategory] = useState<PagesTableCategory>("all");
  const [scanId, setScanId] = useState<string | null>(null);
  const [pages, setPages] = useState<SitePageRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setPages(null);
    setError(null);
    getSitePages(params.id, categoryToApi(category))
      .then((r) => {
        setScanId(r.scan_id);
        setPages(r.pages);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load pages"));
  }, [params.id, category]);

  const worst = useMemo(() => {
    if (!pages) return [];
    return [...pages]
      .sort((a, b) => (b.issue_count ?? 0) - (a.issue_count ?? 0))
      .slice(0, 10);
  }, [pages]);

  const totalIssues = useMemo(
    () => (pages ?? []).reduce((sum, p) => sum + (p.issue_count ?? 0), 0),
    [pages],
  );

  if (error) {
    return (
      <div className="light-theme bg-white px-6 py-10 text-black lg:px-12">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!pages) return <CompassLoader fullPage label="Loading pages…" />;

  return (
    <div className="light-theme bg-white text-black">
      <section className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Site inventory</p>
        <h1 className="mt-3 max-w-[16ch] text-[40px] font-semibold leading-[0.95] tracking-[-0.04em] lg:text-[56px]">
          Pages
        </h1>
        <p className="mt-4 max-w-2xl text-sm leading-6 text-[#525252]">
          Every page found on this site, with the issues each one carries. Start with the pages
          below — they hold the most.
        </p>
        <div className="mt-8 grid max-w-xl grid-cols-2 gap-3 border border-[#e5e5e5] p-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Pages</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{pages.length.toLocaleString("en-US")}</p>
          </div>
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Open issues</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight">{totalIssues.toLocaleString("en-US")}</p>
          </div>
        </div>
      </section>

      <section className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Priority</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Pages with most issues</h2>
          </div>
          <p className="text-sm text-[#737373]">{worst.length} shown</p>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {worst.map((p) => (
            <button
              key={p.page_id}
              type="button"
              onClick={() => scanId && router.push(`/scans/${scanId}/inspect?page=${p.page_id}`)}
              className="flex w-[220px] flex-none flex-col overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] text-left hover:border-black"
              aria-label={`Inspect ${p.url}`}
            >
              <div className="p-4">
                <div className="truncate text-sm font-semibold">{p.title || "(untitled)"}</div>
                <div className="mt-3 flex items-center justify-between text-[13px] text-[#737373]">
                  <span>{p.issue_count ?? 0} issues</span>
                  <ScoreRing score={p.score} size={34} stroke={4} />
                </div>
              </div>
            </button>
          ))}
          {worst.length === 0 && <p className="text-sm text-[#737373]">No pages yet.</p>}
        </div>
      </section>

      <div className="px-6 py-10 lg:px-12">
        <PagesTable
          siteId={params.id}
          scanId={scanId}
          pages={pages}
          category={category}
          onCategoryChange={setCategory}
          onInspect={(pageId) => scanId && router.push(`/scans/${scanId}/inspect?page=${pageId}`)}
        />
      </div>
    </div>
  );
}
