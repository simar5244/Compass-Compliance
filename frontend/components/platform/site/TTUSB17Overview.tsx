"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { getSiteIssues, type SiteIssue } from "@/lib/auth";

const PAGE_SIZE = 10;

const TIERS = [
  [1, "Tier 1", "Legal review required"],
  [2, "Tier 2", "Review recommended"],
  [3, "Tier 3", "Monitor"],
] as const;

function matches(issue: SiteIssue, tier: number): { text: string; context: string }[] {
  try {
    const payload = JSON.parse(issue.html_snippet || "{}");
    return Array.isArray(payload[`tier${tier}_matches`]) ? payload[`tier${tier}_matches`] : [];
  } catch {
    return [];
  }
}

function Pager({
  page,
  total,
  onPage,
}: {
  page: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  if (total <= PAGE_SIZE) return null;
  return (
    <div className="flex items-center justify-end gap-2 border-t border-[#e5e5e5] px-5 py-3 text-sm">
      <button
        type="button"
        onClick={() => onPage(Math.max(1, safePage - 1))}
        disabled={safePage <= 1}
        className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[7rem] text-center text-[#525252]">
        Page {safePage} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(pageCount, safePage + 1))}
        disabled={safePage >= pageCount}
        className="grid size-9 place-items-center border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </div>
  );
}

function TierList({
  title,
  subtitle,
  rows,
}: {
  title: string;
  subtitle: string;
  rows: { issue: SiteIssue; match: { text: string; context: string } }[];
}) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = rows.slice((safePage - 1) * PAGE_SIZE, (safePage - 1) * PAGE_SIZE + PAGE_SIZE);

  useEffect(() => {
    setPage(1);
  }, [rows.length]);

  return (
    <section className="rounded-[3px] border border-[#e5e5e5] bg-white">
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-[#e5e5e5] px-5 py-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">{title}</p>
          <h2 className="mt-1 text-xl font-semibold tracking-tight">{subtitle}</h2>
        </div>
        <p className="text-sm text-[#737373]">
          {rows.length.toLocaleString("en-US")} {rows.length === 1 ? "match" : "matches"}
        </p>
      </div>
      {rows.length ? (
        <>
          <div className="divide-y divide-[#e5e5e5]">
            {visible.map(({ issue, match }, rowIndex) => (
              <article key={`${issue.id}-${(safePage - 1) * PAGE_SIZE + rowIndex}`} className="px-5 py-4">
                <p className="text-sm font-medium text-black">“{match.text}”</p>
                <p className="mt-1 text-sm leading-6 text-[#525252]">{match.context}</p>
                <p className="mt-2 text-xs text-[#737373]">{issue.page_url}</p>
              </article>
            ))}
          </div>
          <Pager page={safePage} total={rows.length} onPage={setPage} />
        </>
      ) : (
        <p className="px-5 py-6 text-sm text-[#737373]">No matches in this tier.</p>
      )}
    </section>
  );
}

export default function TTUSB17Overview() {
  const { id } = useParams<{ id: string }>();
  const [issues, setIssues] = useState<SiteIssue[] | null>(null);

  useEffect(() => {
    getSiteIssues(id, "TTU Compliance", "Senate Bill 17")
      .then((r) => setIssues(r.issues))
      .catch(() => setIssues([]));
  }, [id]);

  const counts = useMemo(
    () =>
      TIERS.map(([tier]) =>
        (issues ?? []).reduce((sum, issue) => sum + matches(issue, tier).length, 0),
      ),
    [issues],
  );

  if (!issues) return <CompassLoader fullPage label="Loading Senate Bill 17 review…" />;

  const report = () => {
    const blob = new Blob(
      [
        JSON.stringify(
          {
            category: "TTU Compliance",
            subcategory: "Senate Bill 17",
            issues: issues.map((issue) => ({
              ...issue,
              tier1_matches: matches(issue, 1),
              tier2_matches: matches(issue, 2),
              tier3_matches: matches(issue, 3),
            })),
          },
          null,
          2,
        ),
      ],
      { type: "application/json" },
    );
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ttu-sb17-compliance-report.json";
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const [lead, ...rest] = TIERS.map(([tier, label, subtitle], index) => ({
    tier,
    label,
    subtitle,
    count: counts[index],
  }));

  return (
    <div className="light-theme min-h-full bg-white text-black">
      <section className="grid gap-10 border-b border-[#e5e5e5] px-6 py-10 lg:grid-cols-[1.2fr_0.8fr] lg:px-12 lg:py-14">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">TTU Compliance</p>
          <h1 className="mt-3 max-w-[14ch] text-[40px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[56px]">
            Senate Bill 17
          </h1>
          <p className="mt-5 max-w-[68ch] text-sm leading-6 text-[#525252]">
            Review potential SB17 language with TTU’s Office of General Counsel. Matches are grouped
            by review urgency.
          </p>
        </div>
        <div className="flex items-end lg:justify-end">
          <button
            type="button"
            onClick={report}
            className="rounded-[3px] bg-black px-6 py-3 text-sm font-semibold text-white hover:bg-[#262626]"
          >
            Generate SB17 Report
          </button>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-3 px-6 py-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr] lg:px-12">
        {lead && (
          <div className="flex min-h-[220px] flex-col justify-between rounded-[3px] bg-black p-6 text-white lg:min-h-[240px] lg:p-7">
            <div>
              <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{lead.label}</p>
              <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
                {lead.count.toLocaleString("en-US")}
              </p>
            </div>
            <p className="text-lg font-semibold">{lead.subtitle}</p>
          </div>
        )}
        {rest.map((tile) => (
          <div
            key={tile.tier}
            className="flex min-h-[220px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6 lg:min-h-[240px]"
          >
            <p className="text-[32px] font-semibold leading-none tracking-[-0.05em]">
              {tile.count.toLocaleString("en-US")}
            </p>
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{tile.label}</p>
              <p className="mt-2 text-lg font-semibold">{tile.subtitle}</p>
            </div>
          </div>
        ))}
      </section>

      <div className="space-y-5 px-6 pb-12 lg:px-12">
        {TIERS.map(([tier, title, subtitle]) => {
          const rows = issues.flatMap((issue) =>
            matches(issue, tier).map((match) => ({ issue, match })),
          );
          return <TierList key={tier} title={title} subtitle={subtitle} rows={rows} />;
        })}
      </div>
    </div>
  );
}
