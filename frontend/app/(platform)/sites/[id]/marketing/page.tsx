"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowUpRight, ChevronLeft, ChevronRight, Users } from "lucide-react";

import { getMarketingOverview, type MarketingOverview } from "@/lib/auth";
import {
  AreaTrend,
  bandLabel,
  MultiLineChart,
  ScoreSparkline,
} from "@/components/platform/site/overview/OverviewPrimitives";

const PAGE_SIZE = 10;
const GROUP_COLORS = { content: "#000000", technical: "#737373" };

type HistoryRow = MarketingOverview["history"][number];
type CompetitorRow = { rank: number; website: string; strength: string };

function deltaCopy(delta: number | null, score: number | null) {
  if (delta != null && delta !== 0) {
    return `${delta > 0 ? "Up" : "Down"} ${Math.abs(delta).toFixed(2)}%`;
  }
  if (delta === 0) return "No change since the last run";
  if (score != null) return "No previous run to compare";
  return null;
}

function Pager({
  page,
  pageCount,
  onPage,
  label,
}: {
  page: number;
  pageCount: number;
  onPage: (next: number) => void;
  label: string;
}) {
  if (pageCount <= 1) return null;
  return (
    <nav aria-label={label} className="mt-4 flex items-center justify-end gap-2 text-sm">
      <button
        type="button"
        onClick={() => onPage(Math.max(1, page - 1))}
        disabled={page <= 1}
        className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Previous page"
      >
        <ChevronLeft size={16} />
      </button>
      <span className="min-w-[7rem] text-center text-[#525252]">
        Page {page} of {pageCount}
      </span>
      <button
        type="button"
        onClick={() => onPage(Math.min(pageCount, page + 1))}
        disabled={page >= pageCount}
        className="grid size-9 place-items-center rounded-[3px] border border-[#e5e5e5] disabled:opacity-30"
        aria-label="Next page"
      >
        <ChevronRight size={16} />
      </button>
    </nav>
  );
}

function CompetitorTable({ title, rows }: { title: string; rows: CompetitorRow[] }) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section className="rounded-[3px] border border-[#e5e5e5] bg-white">
      <div className="flex items-center justify-between gap-3 border-b border-[#e5e5e5] px-5 py-4">
        <h2 className="text-base font-semibold text-black">{title}</h2>
        <span className="bg-[#f5f5f5] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-[#737373]">
          {rows.length}
        </span>
      </div>
      <table className="w-full text-left">
        <thead>
          <tr className="bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
            <th scope="col" className="px-5 py-3 font-medium">Rank</th>
            <th scope="col" className="px-5 py-3 font-medium">Website</th>
            <th scope="col" className="px-5 py-3 text-right font-medium">Strength</th>
          </tr>
        </thead>
        <tbody>
          {visible.length === 0 ? (
            <tr>
              <td colSpan={3} className="px-5 py-8 text-center text-[13px] text-[#737373]">
                No competitors found.
              </td>
            </tr>
          ) : (
            visible.map((row) => (
              <tr key={`${row.rank}-${row.website}`} className="border-t border-[#e5e5e5]">
                <td className="px-5 py-3 text-sm tabular-nums">{row.rank}</td>
                <td className="px-5 py-3 text-sm">{row.website}</td>
                <td className="px-5 py-3 text-right text-sm">{row.strength}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {pageCount > 1 && (
        <div className="px-5 pb-4">
          <Pager page={safePage} pageCount={pageCount} onPage={setPage} label={`${title} pagination`} />
        </div>
      )}
    </section>
  );
}

function HistoryTable({ rows }: { rows: HistoryRow[] }) {
  const [page, setPage] = useState(1);
  const ordered = useMemo(
    () => [...rows].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime()),
    [rows],
  );
  const pageCount = Math.max(1, Math.ceil(ordered.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const visible = ordered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  return (
    <section className="px-6 pb-12 lg:px-12">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Runs</p>
          <h2 className="mt-2 text-3xl font-semibold tracking-tight">Scan history</h2>
        </div>
        <p className="text-sm text-[#737373]">{ordered.length} total</p>
      </div>
      <div className="overflow-x-auto rounded-[3px] border border-[#e5e5e5]">
        <table className="w-full text-left">
          <thead>
            <tr className="border-b border-[#e5e5e5] bg-[#fafafa] text-[11px] uppercase tracking-[0.12em] text-[#737373]">
              <th scope="col" className="px-5 py-3 font-medium">Date</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Score</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Content</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Technical</th>
              <th scope="col" className="px-5 py-3 text-right font-medium">Words</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-5 py-8 text-center text-[13px] text-[#737373]">
                  No completed runs yet.
                </td>
              </tr>
            ) : (
              visible.map((row) => (
                <tr key={row.at} className="border-b border-[#e5e5e5] last:border-b-0">
                  <td className="px-5 py-3 text-sm">
                    {new Date(row.at).toLocaleDateString(undefined, {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                    })}
                  </td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums">
                    {row.score == null ? "—" : Math.round(row.score)}
                  </td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums">
                    {row.content_optimization == null ? "—" : Math.round(row.content_optimization)}
                  </td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums">
                    {row.technical_optimization == null ? "—" : Math.round(row.technical_optimization)}
                  </td>
                  <td className="px-5 py-3 text-right text-sm tabular-nums">
                    {row.words?.toLocaleString("en-US") ?? "—"}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <Pager page={safePage} pageCount={pageCount} onPage={setPage} label="Scan history pagination" />
    </section>
  );
}

export default function MarketingOverviewPage() {
  const params = useParams<{ id: string }>();
  const requestKey = params.id;
  const [loaded, setLoaded] = useState<{
    key: string;
    data: MarketingOverview | null;
    error: string | null;
  }>({ key: "", data: null, error: null });

  useEffect(() => {
    let cancelled = false;
    getMarketingOverview(params.id)
      .then((r) => { if (!cancelled) setLoaded({ key: requestKey, data: r, error: null }); })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, data: null,
            error: e instanceof Error ? e.message : "Failed to load the marketing overview",
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
  if (!data) return <CompassLoader fullPage label="Loading marketing overview…" />;

  const scorePoints = data.history
    .filter((point): point is typeof point & { score: number } => point.score != null)
    .map((point) => ({ at: point.at, value: point.score }));
  const wordPoints = data.history
    .filter((point): point is typeof point & { words: number } => point.words != null)
    .map((point) => ({ at: point.at, value: point.words }));

  const content = data.groups.content_optimization;
  const technical = data.groups.technical_optimization;
  const contentDelta = deltaCopy(content.delta, content.score);
  const technicalDelta = deltaCopy(technical.delta, technical.score);
  const keywordCompetitors: CompetitorRow[] = [];
  const adCompetitors: CompetitorRow[] = [];

  return (
    <div className="light-theme bg-white text-black">
      <section className="px-6 py-10 lg:px-12 lg:py-14">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Marketing</p>
        <h1 className="mt-3 max-w-[14ch] text-[48px] font-semibold leading-[0.92] tracking-[-0.05em] lg:text-[72px]">
          Marketing
        </h1>
        <p className="mt-6 max-w-xl text-sm leading-6 text-[#525252]">
          How well optimized this website is for website marketing.
        </p>
        <p className="mt-4 flex items-center gap-2 text-sm text-[#737373]">
          <Users aria-hidden className="h-4 w-4" /> For people improving marketing
        </p>
      </section>

      <section className="grid grid-cols-1 gap-3 px-6 pb-8 sm:grid-cols-2 lg:grid-cols-[1.35fr_1fr_1fr_1fr] lg:px-12">
        <div className="flex min-h-[220px] flex-col justify-between rounded-[3px] bg-black p-6 text-white lg:min-h-[240px] lg:p-7">
          <div>
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/45">{bandLabel(data.score)}</p>
            <p className="mt-3 text-[36px] font-semibold leading-none tracking-[-0.05em] lg:text-[48px]">
              {data.score == null ? "—" : Math.round(data.score)}
            </p>
          </div>
          <div>
            <p className="text-lg font-semibold lg:text-xl">Overall score</p>
            <p className="mt-1 max-w-sm text-sm text-white/60">Latest completed scan</p>
          </div>
        </div>

        <Link
          href={`/sites/${params.id}/marketing/content-optimization`}
          className="group flex min-h-[220px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6 hover:border-black lg:min-h-[240px]"
        >
          <div>
            <p className="text-[32px] font-semibold leading-none tracking-[-0.05em] lg:text-[36px]">
              {content.score == null ? "—" : Math.round(content.score)}
            </p>
            <div className="mt-4 h-1 w-full bg-[#e5e5e5]" role="img" aria-label={`Content optimization ${content.score ?? "not scored"}%`}>
              <div
                className="h-full bg-black"
                style={{ width: `${Math.max(0, Math.min(100, content.score ?? 0))}%` }}
              />
            </div>
          </div>
          <div className="mt-6 flex items-end justify-between gap-3">
            <div>
              {contentDelta && (
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{contentDelta}</p>
              )}
              <p className="mt-2 text-lg font-semibold">Content</p>
            </div>
            <ArrowUpRight aria-hidden className="h-5 w-5 shrink-0 text-[#737373] group-hover:text-black" />
          </div>
        </Link>

        <Link
          href={`/sites/${params.id}/marketing/technical-optimization`}
          className="group flex min-h-[220px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6 hover:border-black lg:min-h-[240px]"
        >
          <div>
            <p className="text-[32px] font-semibold leading-none tracking-[-0.05em] lg:text-[36px]">
              {technical.score == null ? "—" : Math.round(technical.score)}
            </p>
            <div className="mt-4 h-1 w-full bg-[#e5e5e5]" role="img" aria-label={`Technical optimization ${technical.score ?? "not scored"}%`}>
              <div
                className="h-full bg-black"
                style={{ width: `${Math.max(0, Math.min(100, technical.score ?? 0))}%` }}
              />
            </div>
          </div>
          <div className="mt-6 flex items-end justify-between gap-3">
            <div>
              {technicalDelta && (
                <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">{technicalDelta}</p>
              )}
              <p className="mt-2 text-lg font-semibold">Technical</p>
            </div>
            <ArrowUpRight aria-hidden className="h-5 w-5 shrink-0 text-[#737373] group-hover:text-black" />
          </div>
        </Link>

        <Link
          href={`/sites/${params.id}/marketing/amount-of-content`}
          className="group flex min-h-[220px] flex-col justify-between rounded-[3px] border border-[#e5e5e5] bg-[#fafafa] p-6 hover:border-black lg:min-h-[240px]"
        >
          <p className="text-[32px] font-semibold leading-none tracking-[-0.05em] lg:text-[36px]">
            {data.words.total?.toLocaleString("en-US") ?? "—"}
          </p>
          <div className="mt-6 flex items-end justify-between gap-3">
            <div>
              <p className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">Across the site</p>
              <p className="mt-2 text-lg font-semibold">Words</p>
            </div>
            <ArrowUpRight aria-hidden className="h-5 w-5 shrink-0 text-[#737373] group-hover:text-black" />
          </div>
        </Link>
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-10 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Trend</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Score over time</h2>
        <div className="mt-6 rounded-[3px] border border-[#e5e5e5] bg-white p-5">
          <ScoreSparkline points={scorePoints} />
        </div>
      </section>

      <section className="px-6 pb-10 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Copy volume</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Word count</h2>
        <div className="mt-6 rounded-[3px] border border-[#e5e5e5] bg-white p-5 lg:p-6">
          <p className="mb-4 text-[15px] text-[#737373]">
            <span className="mr-2 text-[32px] font-semibold tracking-tight text-black">
              {data.words.total?.toLocaleString("en-US") ?? "—"}
            </span>
            Words
          </p>
          <AreaTrend
            points={wordPoints}
            color="#000000"
            fill="#f5f5f5"
            yLabel="Number of words"
            ariaLabel="Total word count over time"
          />
        </div>
      </section>

      <section className="border-t border-[#e5e5e5] px-6 py-10 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">History</p>
        <h2 className="mt-2 text-3xl font-semibold tracking-tight">Scores over time</h2>
        <div className="mt-6 rounded-[3px] border border-[#e5e5e5] bg-white p-5">
          <MultiLineChart
            points={data.history}
            series={[
              { key: "content_optimization", label: "Content optimization", color: GROUP_COLORS.content },
              { key: "technical_optimization", label: "Technical optimization", color: GROUP_COLORS.technical },
            ]}
            ariaLabel="Content and technical optimization scores over time"
          />
        </div>
      </section>

      <HistoryTable rows={data.history} />

      {/* Competitor discovery is not part of this engine, so both tables stand
          empty rather than being filled with anything invented. */}
      <section className="border-t border-[#e5e5e5] px-6 py-10 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Landscape</p>
        <h2 className="mt-2 mb-6 text-3xl font-semibold tracking-tight">Competitors</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <CompetitorTable title="Keyword competitors" rows={keywordCompetitors} />
          <CompetitorTable title="Ad competitors" rows={adCompetitors} />
        </div>
      </section>
    </div>
  );
}
