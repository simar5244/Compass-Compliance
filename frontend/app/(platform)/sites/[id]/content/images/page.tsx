"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { ChecksTable } from "@/components/platform/site/ChecksTable";
import { getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";

const INTRO =
  "The image checks in this module: whether pictures carry alternative text that adds something " +
  "for a screen reader rather than repeating the words beside them, and whether the files " +
  "themselves are heavier than they need to be. Image weight is measured by the performance " +
  "engine, so those rows appear only when performance scanning is enabled for this site.";

/** Checks in this module that are about images, kept in the module's own order. */
function isImageCheck(check: SiteCheckRow): boolean {
  const haystack = `${check.check_id} ${check.display_name ?? ""}`.toLowerCase();
  return /\bimage|\bimg|alternative text|\balt\b/.test(haystack);
}

export default function ContentImagesPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [checks, setChecks] = useState<SiteCheckRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getSiteChecksFull(params.id, "content")
      .then((r) => { if (!cancelled) setChecks(r.checks); })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load image checks");
      });
    return () => { cancelled = true; };
  }, [params.id]);

  const imageChecks = useMemo(() => (checks ?? []).filter(isImageCheck), [checks]);
  const blocked = imageChecks.filter((check) => check.blocked_by).length;
  const openIssues = imageChecks.reduce((sum, check) => sum + (check.issues ?? 0), 0);

  if (error) {
    return (
      <div className="bg-white px-6 py-10 text-sm text-[#737373] lg:px-12">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!checks) return <CompassLoader fullPage label="Loading image checks…" />;

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Content</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">Images</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">{INTRO}</p>

        <div className="mt-8 grid max-w-3xl gap-3 sm:grid-cols-3">
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Checks</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{imageChecks.length}</p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Open issues</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {openIssues.toLocaleString("en-US")}
            </p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Blocked</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{blocked}</p>
          </div>
        </div>
        {blocked > 0 && (
          <p className="mt-4 text-sm text-[#737373]">
            {blocked} {blocked === 1 ? "check needs" : "checks need"} performance scanning, which is
            off for this site.
          </p>
        )}
      </header>

      <section className="px-6 py-8 lg:px-12">
        <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
          <div className="flex items-center gap-3 border-b border-[#e5e5e5] px-5 py-4">
            <h2 className="text-lg font-semibold">Checks</h2>
            <span className="border border-[#e5e5e5] bg-[#fafafa] px-2 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
              {imageChecks.length}
            </span>
          </div>

          {imageChecks.length === 0 ? (
            <p className="px-5 py-14 text-center text-sm text-[#737373]">This module has no image checks.</p>
          ) : (
            <ChecksTable
              siteId={params.id}
              checks={imageChecks}
              onRowClick={(checkId) => router.push(`/sites/${params.id}/checks/${checkId}`)}
            />
          )}
        </div>
      </section>
    </div>
  );
}
