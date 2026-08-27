"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSiteChecksFull, getSiteIssues, getSitePages, type SiteIssue } from "@/lib/auth";

const PAGE_SIZE = 10;

const GROUPS = [
  ["ADA Status", "ADA / Section 508"],
  ["FERPA Status", "FERPA"],
  ["Emergency Info Status", "Emergency Info"],
] as const;

function status(issues: SiteIssue[]) {
  if (!issues.length) return { status: "Compliant", hint: "No issues in the latest scan" };
  if (issues.every((issue) => issue.manual_review)) {
    return { status: "Needs attention", hint: "Manual review required" };
  }
  return {
    status: "Non-compliant",
    hint: `${issues.length} ${issues.length === 1 ? "issue" : "issues"}`,
  };
}

export default function TTUComplianceOverview() {
  const { id } = useParams<{ id: string }>();
  const [issues, setIssues] = useState<SiteIssue[]>([]);
  const [checks, setChecks] = useState<Awaited<ReturnType<typeof getSiteChecksFull>>["checks"]>([]);
  const [pages, setPages] = useState<Awaited<ReturnType<typeof getSitePages>>["pages"]>([]);
  const [loaded, setLoaded] = useState(false);
  const [checkPage, setCheckPage] = useState(1);

  useEffect(() => {
    Promise.all([
      getSiteIssues(id, "TTU Compliance"),
      getSiteChecksFull(id, "ttu-compliance"),
      getSitePages(id, "TTU Compliance"),
    ])
      .then(([i, c, p]) => {
        setIssues(i.issues);
        setChecks(c.checks);
        setPages(p.pages);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  }, [id]);

  useEffect(() => {
    setCheckPage(1);
  }, [checks.length]);

  const download = () => {
    const blob = new Blob(
      [JSON.stringify({ category: "TTU Compliance", scan_id: issues[0]?.scan_id ?? null, issues }, null, 2)],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ttu-compliance-report.json";
    a.click();
    URL.revokeObjectURL(url);
  };

  const sb17 = issues.filter((i) => i.rule_id === "sb17_context_aware");
  const tiers = [1, 2, 3].map((tier) =>
    sb17.reduce((n, issue) => {
      try {
        return n + ((JSON.parse(issue.html_snippet || "{}")[`tier${tier}_matches`] || []).length);
      } catch {
        return n;
      }
    }, 0),
  );
  const stale = issues.filter((i) => i.rule_id === "stale_content");
  const oldest = stale
    .map((i) => {
      try {
        return JSON.parse(i.html_snippet || "{}").last_changed_at;
      } catch {
        return null;
      }
    })
    .filter(Boolean)
    .sort()[0];

  const groupTiles = GROUPS.map(([label, group]) => {
    const subset = issues.filter((i) => i.subcategory === group);
    return { label, group, ...status(subset) };
  });
  const [lead, ...rest] = groupTiles;

  const checkPageCount = Math.max(1, Math.ceil(checks.length / PAGE_SIZE));
  const safeCheckPage = Math.min(checkPage, checkPageCount);
  const visibleChecks = checks.slice((safeCheckPage - 1) * PAGE_SIZE, (safeCheckPage - 1) * PAGE_SIZE + PAGE_SIZE);

  if (!loaded) return <CompassLoader fullPage label="Loading TTU Compliance overview…" />;

  return (
    <div className="light-theme bg-white text-black">
      <section className="grid gap-10 border-b border-[#e5e5e5] px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-14">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Texas Tech University</p>
          <h1 className="mt-3 max-w-[14ch] text-[40px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[56px]">
            TTU Compliance
          </h1>
          <p className="mt-5 max-w-[48ch] text-sm leading-6 text-[#525252]">
            Texas Tech University compliance checks and content health.
          </p>
        </div>
        <div className="flex items-end lg:justify-end">
          <button
            type="button"
            onClick={download}
            className="rounded-[3px] bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-[#262626]"
          >
            Generate Compliance Report
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 px-6 py-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr] lg:px-12">
        {lead && (
          <div className="flex min-h-[220px] flex-col justify-between rounded-[3px] bg-black p-6 text-white lg:min-h-[240px] lg:p-7">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{lead.label}</p>
              <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
                {lead.status}
              </p>
            </div>
            <p className="text-sm text-white/60">{lead.hint}</p>
          </div>
        )}
        {rest.map((tile) => (
          <div
            key={tile.group}
            className="flex min-h-[220px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6 lg:min-h-[240px]"
          >
            <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{tile.label}</p>
            <div>
              <p className="text-[28px] font-semibold leading-none tracking-[-0.05em]">{tile.status}</p>
              <p className="mt-3 text-sm text-[#737373]">{tile.hint}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="grid gap-3 px-6 pb-8 md:grid-cols-2 lg:px-12">
        <div className="flex min-h-[180px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-white p-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Senate Bill 17</p>
            <p className="mt-3 text-lg font-semibold tracking-tight">
              {sb17.length
                ? `${sb17.length} ${sb17.length === 1 ? "issue" : "issues"}`
                : "No issues found"}
            </p>
            <p className="mt-2 text-sm text-[#525252]">
              Tier 1: {tiers[0]} · Tier 2: {tiers[1]} · Tier 3: {tiers[2]}
            </p>
          </div>
          <Link
            className="mt-6 inline-block text-sm font-semibold text-black underline underline-offset-2 hover:text-[#262626]"
            href={`/sites/${id}/ttu-compliance/sb17`}
          >
            View SB17 Report →
          </Link>
        </div>
        <div className="flex min-h-[180px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6">
          <div>
            <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">Content Health</p>
            <p className="mt-3 text-lg font-semibold tracking-tight">
              {stale.length
                ? `${stale.length} stale ${stale.length === 1 ? "page" : "pages"}`
                : "No stale content detected"}
            </p>
            {oldest && (
              <p className="mt-2 text-sm text-[#525252]">
                Oldest change {new Date(oldest).toLocaleDateString()}
              </p>
            )}
          </div>
        </div>
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-10 lg:px-12">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Module list</p>
            <h2 className="mt-2 text-3xl font-semibold tracking-tight">Checks</h2>
          </div>
          <p className="text-sm text-[#737373]">{checks.length} total</p>
        </div>
        <div className="overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white">
          {visibleChecks.map((check) => (
            <div
              key={check.check_id}
              className="flex items-center justify-between gap-4 border-b border-[#e5e5e5] px-5 py-4 last:border-b-0"
            >
              <span className="text-sm font-semibold">{check.display_name ?? check.check_id}</span>
              <span className="shrink-0 text-lg font-semibold tabular-nums">{check.issues ?? 0}</span>
            </div>
          ))}
          {visibleChecks.length === 0 && (
            <p className="px-5 py-10 text-sm text-[#737373]">Run a scan to populate checks.</p>
          )}
        </div>
        {checks.length > PAGE_SIZE && (
          <div className="mt-4 flex items-center justify-end gap-2 text-sm">
            <button
              type="button"
              onClick={() => setCheckPage((p) => Math.max(1, p - 1))}
              disabled={safeCheckPage <= 1}
              className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
              aria-label="Previous page"
            >
              <ChevronLeft size={16} />
            </button>
            <span className="min-w-[7rem] text-center text-[#525252]">
              Page {safeCheckPage} of {checkPageCount}
            </span>
            <button
              type="button"
              onClick={() => setCheckPage((p) => Math.min(checkPageCount, p + 1))}
              disabled={safeCheckPage >= checkPageCount}
              className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
              aria-label="Next page"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}
        <span className="sr-only">{pages.length} pages scanned</span>
      </section>
    </div>
  );
}
