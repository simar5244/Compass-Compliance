"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
import { Users } from "lucide-react";

import { getAccessibilityOverview, type AccessibilityOverview } from "@/lib/auth";
import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";
import {
  CommonIssuesPie,
  IssuesPerPageBars,
  LEVEL_COLORS,
} from "@/components/platform/site/accessibility/OverviewCharts";
import {
  bandLabel,
  MultiLineChart,
  ScoreSparkline,
} from "@/components/platform/site/overview/OverviewPrimitives";

const PAGE_SIZE = 10;

const LEVELS = [
  { key: "a" as const, label: "Level A" },
  { key: "aa" as const, label: "Level AA" },
  { key: "aaa" as const, label: "Level AAA" },
];

function deltaCopy(delta: number | null) {
  if (delta == null) return "No previous run to compare";
  if (delta === 0) return "No change since the last run";
  return `${delta > 0 ? "↑ Up" : "↓ Down"} ${Math.abs(delta).toFixed(2)}%`;
}

function formatScore(value: number | null): string {
  return value == null ? "—" : `${Math.round(value)}`;
}

function formatWhen(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
}

export default function AccessibilityOverviewPage() {
  const params = useParams<{ id: string }>();
  const requestKey = params.id;
  const [loaded, setLoaded] = useState<{
    key: string;
    data: AccessibilityOverview | null;
    error: string | null;
  }>({ key: "", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getAccessibilityOverview(params.id)
      .then((r) => { if (!cancelled) setLoaded({ key: requestKey, data: r, error: null }); })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, data: null,
            error: e instanceof Error ? e.message : "Failed to load the accessibility overview",
          });
        }
      });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const fresh = loaded.key === requestKey ? loaded : null;
  const data = fresh?.data ?? null;
  const error = fresh?.error ?? null;

  if (error) {
    return (
      <div className="light-theme bg-white px-8 py-10 text-sm text-[#737373]">
        {error.includes("404") ? "No completed scan yet." : error}
      </div>
    );
  }
  if (!data) return <CompassLoader fullPage label="Loading accessibility overview…" />;

  const scorePoints = data.history
    .filter((point): point is typeof point & { score: number } => point.score != null)
    .map((point) => ({ at: point.at, value: point.score }));

  const previous = scorePoints.length > 1 ? scorePoints.at(-2)!.value : null;
  const overallDelta =
    data.score != null && previous != null ? data.score - previous : null;

  return (
    <div className="light-theme bg-white px-6 py-6 text-black lg:px-12">
      <h1 className="text-[28px] font-semibold leading-8 tracking-tight text-black lg:text-[32px]">
        Accessibility
      </h1>
      <p className="mt-2 max-w-[72ch] text-[14px] leading-6 text-[#525252]">
        How compliant this website is with the WCAG 2.2 accessibility standard.
      </p>
      <p className="mt-3 flex items-center gap-2 text-[13px] text-[#737373]">
        <Users aria-hidden className="h-4 w-4" /> For people improving accessibility
      </p>

      <div className="mt-6 grid gap-3 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
        <section className="rounded-[3px] border border-[#e5e5e5] bg-white">
          <h2 className="border-b border-[#e5e5e5] px-4 py-3 text-[13px] font-semibold tracking-tight">
            Overall score
          </h2>
          <div className="flex flex-col items-center px-4 py-8">
            <InspectorScoreRing score={data.score} size={96} stroke={8} />
            <p className="mt-3 text-[11px] uppercase tracking-[0.16em] text-[#737373]">
              {bandLabel(data.score) || "Latest completed scan"}
            </p>
            <p className="mt-2 text-[13px] text-[#737373]">{deltaCopy(overallDelta)}</p>
          </div>
        </section>

        <section className="rounded-[3px] border border-[#e5e5e5] bg-white p-4">
          <h2 className="mb-3 text-[13px] font-semibold tracking-tight">Score over time</h2>
          <ScoreSparkline points={scorePoints} />
        </section>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        {LEVELS.map((level) => {
          const value = data.levels[level.key];
          return (
            <section key={level.key} className="rounded-[3px] border border-[#e5e5e5] bg-white">
              <h2 className="border-b border-[#e5e5e5] px-4 py-3 text-[13px] font-semibold tracking-tight">
                {level.label}
              </h2>
              <div className="px-4 py-5">
                <p className="text-[32px] font-semibold leading-none tracking-tight tabular-nums">
                  {formatScore(value.score)}
                </p>
                <div
                  className="mt-4 h-1.5 w-full overflow-hidden rounded-[3px] bg-[#e5e5e5]"
                  role="img"
                  aria-label={`${level.label} ${value.score ?? "not scored"}%`}
                >
                  <div
                    className="h-full rounded-[3px] bg-black"
                    style={{ width: `${Math.max(0, Math.min(100, value.score ?? 0))}%` }}
                  />
                </div>
                <p className="mt-3 text-[13px] text-[#737373]">{deltaCopy(value.delta)}</p>
              </div>
            </section>
          );
        })}
      </div>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <section className="rounded-[3px] border border-[#e5e5e5] bg-white p-4">
          <h2 className="mb-4 text-[13px] font-semibold tracking-tight">Most common issues</h2>
          <CommonIssuesPie issues={data.common_issues} />
        </section>
        <section className="overflow-x-auto rounded-[3px] border border-[#e5e5e5] bg-white p-4">
          <h2 className="mb-4 text-[13px] font-semibold tracking-tight">Average issues per page</h2>
          <IssuesPerPageBars rows={data.issues_per_page} />
        </section>
      </div>

      <section className="mt-3 rounded-[3px] border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-4 text-[13px] font-semibold tracking-tight">Who is affected</h2>
        {data.disability_groups.length === 0 ? (
          <p className="py-8 text-center text-[13px] text-[#737373]">No failing checks grouped yet.</p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.disability_groups.map((group) => (
              <div key={group.group} className="rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-4">
                <p className="text-[11px] uppercase tracking-[0.14em] text-[#737373]">{group.group}</p>
                <p className="mt-3 text-3xl font-semibold tracking-tight tabular-nums">{group.failing_checks}</p>
                <p className="mt-1 text-sm text-[#737373]">failing checks</p>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="mt-3 rounded-[3px] border border-[#e5e5e5] bg-white p-4">
        <h2 className="mb-3 text-[13px] font-semibold tracking-tight">Levels over time</h2>
        <MultiLineChart
          points={data.history}
          series={[
            { key: "a", label: "Level A", color: LEVEL_COLORS.a },
            { key: "aa", label: "Level AA", color: LEVEL_COLORS.aa },
            { key: "aaa", label: "Level AAA", color: LEVEL_COLORS.aaa },
          ]}
          ariaLabel="WCAG conformance levels over time"
        />
      </section>

      <div className="mt-3 grid gap-3 lg:grid-cols-2">
        <PagedTable
          title="Common issues"
          count={data.common_issues.length}
          columns={["Issue", "Count"]}
          rows={data.common_issues}
          rowKey={(row) => row.rule_id}
          empty="No accessibility findings."
          render={(row) => [
            row.name,
            <span key="n" className="tabular-nums">{row.issues.toLocaleString("en-US")}</span>,
          ]}
        />
        <PagedTable
          title="Issues per page"
          count={data.issues_per_page.length}
          columns={["Depth", "Average", "Pages"]}
          rows={data.issues_per_page}
          rowKey={(row) => row.label}
          empty="No pages in the latest scan."
          render={(row) => [
            <span key="l" className={row.is_total ? "font-semibold" : undefined}>{row.label}</span>,
            <span key="a" className="tabular-nums">
              {row.average.toLocaleString("en-US", { maximumFractionDigits: 2 })}
            </span>,
            <span key="p" className="tabular-nums">{row.pages.toLocaleString("en-US")}</span>,
          ]}
        />
      </div>

      <div className="mt-3">
        <PagedTable
          title="Scan history"
          count={data.history.length}
          columns={["Date", "Overall", "Level A", "Level AA", "Level AAA"]}
          rows={[...data.history].reverse()}
          rowKey={(row) => row.at}
          empty="No completed runs yet."
          render={(row) => [
            formatWhen(row.at),
            <span key="s" className="tabular-nums">{formatScore(row.score)}</span>,
            <span key="a" className="tabular-nums">{formatScore(row.a)}</span>,
            <span key="aa" className="tabular-nums">{formatScore(row.aa)}</span>,
            <span key="aaa" className="tabular-nums">{formatScore(row.aaa)}</span>,
          ]}
        />
      </div>
    </div>
  );
}

function PagedTable<T>({
  title,
  count,
  columns,
  rows,
  rowKey,
  empty,
  render,
}: {
  title: string;
  count: number;
  columns: string[];
  rows: T[];
  rowKey: (row: T) => string;
  empty: string;
  render: (row: T) => ReactNode[];
}) {
  const [page, setPage] = useState(0);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const current = Math.min(page, pageCount - 1);
  const slice = rows.slice(current * PAGE_SIZE, current * PAGE_SIZE + PAGE_SIZE);

  return (
    <section className="overflow-hidden rounded-[3px] border border-[#e5e5e5] bg-white">
      <div className="flex items-center gap-2 px-4 py-3">
        <h2 className="text-[13px] font-semibold tracking-tight">{title}</h2>
        <span className="rounded-[3px] bg-[#f5f5f5] px-2 py-0.5 text-[12px] font-medium text-[#525252]">
          {count}
        </span>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full border-t border-[#e5e5e5] text-left">
          <thead>
            <tr className="bg-[#fafafa] text-[12px] text-[#737373]">
              {columns.map((column, index) => (
                <th
                  key={column}
                  scope="col"
                  className={`px-4 py-2.5 font-medium ${index === 0 ? "" : "text-right"}`}
                >
                  {column}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {slice.map((row) => {
              const cells = render(row);
              return (
                <tr key={rowKey(row)} className="border-t border-[#e5e5e5]">
                  {cells.map((cell, index) => (
                    <td
                      key={index}
                      className={`px-4 py-3 text-[13px] text-black ${index === 0 ? "" : "text-right"}`}
                    >
                      {cell}
                    </td>
                  ))}
                </tr>
              );
            })}
            {slice.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-4 py-10 text-center text-sm text-[#737373]">
                  {empty}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {pageCount > 1 && (
        <nav aria-label={`${title} pagination`} className="flex flex-wrap items-center justify-center gap-1 border-t border-[#e5e5e5] py-3">
          {Array.from({ length: pageCount }).map((_, index) => (
            <button
              key={index}
              type="button"
              onClick={() => setPage(index)}
              aria-current={index === current ? "page" : undefined}
              className={`h-8 min-w-8 rounded-[3px] px-2 text-[13px] font-medium ${
                index === current ? "bg-black text-white" : "text-black hover:bg-[#f5f5f5]"
              }`}
            >
              {index + 1}
            </button>
          ))}
        </nav>
      )}
    </section>
  );
}
