"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useSiteCategory } from "@/components/platform/site/useSiteCategory";

import { getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";
import { ChecksTable } from "@/components/platform/site/ChecksTable";

const MODULE_TITLES: Record<string, string> = {
  content: "Content",
  accessibility: "Accessibility",
  marketing: "Marketing",
  ux: "User Experience",
  privacy: "Privacy",
  policies: "Policies",
  "ttu-compliance": "TTU Compliance",
  "brand-standards": "Brand Standards",
};

export default function CategoryChecksPage() {
  const params = useParams<{ id: string }>();
  const category = useSiteCategory();
  const router = useRouter();
  const [checks, setChecks] = useState<SiteCheckRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setChecks(null);
    setError(null);
    getSiteChecksFull(params.id, category)
      .then((r) => setChecks(r.checks))
      .catch((e) => setError(e instanceof Error ? e.message : "Failed to load checks"));
  }, [params.id, category]);

  const title = MODULE_TITLES[category] ?? category;
  const openIssues = useMemo(
    () => (checks ?? []).reduce((sum, row) => sum + (row.issues ?? 0), 0),
    [checks],
  );

  if (error) {
    return (
      <div className="light-theme bg-white px-6 py-10 text-black lg:px-12">
        <p className="text-sm text-red-600">{error}</p>
      </div>
    );
  }
  if (!checks) return <CompassLoader fullPage label="Loading checks…" />;

  return (
    <div className="light-theme bg-white text-black">
      <header className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12 lg:py-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">{title}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight lg:text-4xl">{title} checks</h1>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[#525252]">
          Every check in this module, in the order it is reported. Open one to see the pages it
          affects.
        </p>
        <div className="mt-8 grid max-w-md grid-cols-2 gap-3">
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Checks</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">{checks.length}</p>
          </div>
          <div className="border border-[#e5e5e5] bg-white p-4 rounded-[3px]">
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Open issues</p>
            <p className="mt-1 text-3xl font-semibold tracking-tight tabular-nums">
              {openIssues.toLocaleString("en-US")}
            </p>
          </div>
        </div>
      </header>

      <section className="px-6 py-8 lg:px-12">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Module list</p>
            <h2 className="mt-1 text-2xl font-semibold tracking-tight">Checks</h2>
          </div>
          <span className="border border-[#e5e5e5] bg-[#fafafa] px-2.5 py-0.5 text-[12px] font-medium text-[#525252] rounded-[3px]">
            {checks.length}
          </span>
        </div>
        <div className="overflow-hidden border border-[#e5e5e5] bg-white rounded-[3px]">
          <ChecksTable
            siteId={params.id}
            checks={checks}
            onRowClick={(checkId) => router.push(`/sites/${params.id}/checks/${checkId}`)}
          />
        </div>
      </section>
    </div>
  );
}
