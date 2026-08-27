"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";
import { ChecksTable } from "@/components/platform/site/ChecksTable";

export function TTUFilteredChecks({
  siteId,
  category,
  subcategory,
  title,
  eyebrow,
  description,
}: {
  siteId: string;
  category: string;
  subcategory: string;
  title: string;
  eyebrow?: string;
  description?: string;
}) {
  const router = useRouter();
  const [checks, setChecks] = useState<SiteCheckRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChecks(null);
    setError(null);
    getSiteChecksFull(siteId, category)
      .then((r) => {
        setChecks(r.checks.filter((check) => check.subcategory === subcategory));
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load checks"));
  }, [siteId, category, subcategory]);

  const openIssues = useMemo(
    () => (checks ?? []).reduce((sum, row) => sum + (row.issues ?? 0), 0),
    [checks],
  );

  if (error) {
    return (
      <div className="light-theme bg-white px-6 py-10 text-black lg:px-12">
        <p className="text-sm text-[#737373]">{error}</p>
      </div>
    );
  }
  if (!checks) return <CompassLoader fullPage label="Loading checks…" />;

  return (
    <div
      className="light-theme bg-white text-black"
      style={{
        ["--text-strong" as string]: "#000000",
        ["--text-muted" as string]: "#737373",
        ["--surface" as string]: "#ffffff",
        ["--surface-2" as string]: "#fafafa",
        ["--border-soft" as string]: "#e5e5e5",
        ["--brand" as string]: "#000000",
        ["--sev-error" as string]: "#171717",
        ["--sev-warning" as string]: "#525252",
        ["--sev-info" as string]: "#737373",
        ["--sev-assisted" as string]: "#6b7280",
        ["--sev-policy" as string]: "#404040",
      }}
    >
      <section className="grid gap-10 border-b border-[#e5e5e5] px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-14">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">
            {eyebrow ?? title}
          </p>
          <h1 className="mt-3 max-w-[16ch] text-[40px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[56px]">
            {title}
          </h1>
          <p className="mt-5 max-w-[48ch] text-sm leading-6 text-[#525252]">
            {description ?? "Checks in this category, in the order they are reported. Open one to see the pages it affects."}
          </p>
        </div>
        <div className="flex min-h-[180px] flex-col justify-between rounded-[3px] bg-black p-6 text-white">
          <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">Checks</p>
          <p className="text-[40px] font-semibold leading-none tracking-[-0.05em] tabular-nums">
            {checks.length}
          </p>
        </div>
      </section>

      <section className="px-6 py-8 lg:px-12">
        <div className="mb-6 grid max-w-md grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Open issues</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">
              {openIssues.toLocaleString("en-US")}
            </p>
          </div>
          <div className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-5">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">In this list</p>
            <p className="mt-2 text-3xl font-semibold tracking-tight tabular-nums">{checks.length}</p>
          </div>
        </div>

        <div className="mb-4">
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Filtered list</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Checks</h2>
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
