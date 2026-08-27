"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { getModuleHistory, getRuns, type RunListItem } from "@/lib/auth";
import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";

/**
 * The frame every Content sub-screen shares: an explanatory header, the score
 * for this area with its movement, a trend built from the site's real run
 * history, and the tab strip above whatever table the screen renders.
 */
export function SubCheckShell({
  title,
  intro,
  scoreCategory,
  scoreModule,
  scoreLabel,
  trendLabel,
  introHeading,
  tabs,
  activeTab,
  onTabChange,
  children,
}: {
  title: string;
  intro: string;
  /** Key in a run's category_scores; omit for screens with no score of their own. */
  scoreCategory?: string;
  /**
   * A module whose score is the mean of its own checks, for sub-views of a
   * category that no run scores directly. Takes precedence over scoreCategory.
   */
  scoreModule?: string;
  scoreLabel?: string;
  /** Heading over the trend; defaults to "<score label> over time". */
  trendLabel?: string;
  /** Heading on the intro card — the action phrase, e.g. "Optimize your technology". */
  introHeading?: string;
  tabs: readonly string[];
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const [runs, setRuns] = useState<RunListItem[] | null>(null);
  const [moduleSeries, setModuleSeries] = useState<{ at: string; score: number }[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (scoreModule) {
      getModuleHistory(params.id, scoreModule)
        .then((r) => {
          if (!cancelled) setModuleSeries(r.points.map((p) => ({ at: p.at, score: p.score })));
        })
        .catch(() => { if (!cancelled) setModuleSeries([]); });
      return () => { cancelled = true; };
    }
    getRuns(params.id)
      .then((r) => { if (!cancelled) setRuns(r.runs); })
      .catch(() => { if (!cancelled) setRuns([]); });
    return () => { cancelled = true; };
  }, [params.id, scoreModule]);

  /** Oldest → newest, only finished runs that scored this area. */
  const series = useMemo(() => {
    if (scoreModule) return moduleSeries ?? [];
    if (!runs || !scoreCategory) return [];
    return runs
      .filter((run) => run.status === "done" && run.category_scores?.[scoreCategory] != null)
      .map((run) => ({ at: run.finished_at ?? run.created_at, score: run.category_scores[scoreCategory] }))
      .reverse();
  }, [runs, moduleSeries, scoreCategory, scoreModule]);

  const latest = series.at(-1)?.score ?? null;
  const previous = series.length > 1 ? series.at(-2)!.score : null;
  const delta = latest != null && previous != null ? latest - previous : null;

  return (
    <div className="px-6 py-6">
      <h1 className="mb-4 text-[26px] font-semibold text-black">{title}</h1>

      <section className="mb-5 rounded-[3px] border border-[#e5e5e5] bg-white p-6">
        <h2 className="text-[18px] font-semibold text-black">{introHeading ?? scoreLabel ?? title}</h2>
        <p className="mt-1.5 max-w-[70ch] text-[14px] leading-[1.6] text-[#737373]">{intro}</p>
      </section>

      {(scoreCategory || scoreModule) && (
        <div className="mb-5 grid gap-5 lg:grid-cols-[minmax(0,260px)_minmax(0,1fr)]">
          <section className="rounded-[3px] border border-[#e5e5e5] bg-white p-5">
            <h3 className="text-[15px] font-semibold text-black">{scoreLabel ?? title}</h3>
            <div className="mt-2 flex flex-col items-center">
              <InspectorScoreRing score={latest} size={80} stroke={5} />
              {delta != null && delta !== 0 && (
                <p className={`mt-2 text-[11px] font-medium ${delta > 0 ? "text-[#12805c]" : "text-[#c0392b]"}`}>
                  {delta > 0 ? "↑ Up" : "↓ Down"} {Math.abs(delta).toFixed(2)}%
                </p>
              )}
              {delta === null && latest != null && (
                <p className="mt-2 text-[13px] text-[#737373]">No previous run to compare</p>
              )}
            </div>
          </section>

          <section className="flex min-h-[160px] flex-col rounded-[3px] border border-[#e5e5e5] bg-white p-4">
            <h3 className="mb-2 text-[13px] font-normal text-black">{trendLabel ?? `${scoreLabel ?? title} over time`}</h3>
            <ScoreTrend series={series} />
          </section>
        </div>
      )}

      <div className="rounded-t-[3px] border border-[#e5e5e5] bg-white">
        <div className="flex border-b border-[#e5e5e5]">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-current={tab === activeTab ? "page" : undefined}
              className={`px-6 py-3 text-[14px] font-medium ${
                tab === activeTab
                  ? "border-b-2 border-black text-black"
                  : "text-[#737373] hover:text-black"
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        {children}
      </div>
    </div>
  );
}

/** Score over the site's run history. Flat when there is only one run. */
function ScoreTrend({ series }: { series: { at: string; score: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length === 0) {
    return <p className="py-8 text-center text-[13px] text-[#737373]">No completed runs yet.</p>;
  }
  if (series.length === 1) {
    return (
      <p className="py-8 text-center text-[13px] text-[#737373]">
        One run so far, scoring {Math.round(series[0].score)}%. A trend appears from the second run.
      </p>
    );
  }

  const width = 1200;
  const height = 90;
  const pad = 10;
  const step = (width - pad * 2) / (series.length - 1);
  const y = (score: number) => pad + (1 - score / 100) * (height - pad * 2);
  const points = series.map((point, index) => `${pad + index * step},${y(point.score)}`);

  return (
    <div className="relative flex-1">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMinYMid meet"
        className="h-[90px] w-full"
        role="img"
        aria-label="Score over time"
        onMouseLeave={() => setHovered(null)}
      >
      {[0, 50, 100].map((line) => (
        <g key={line}>
          <line x1={pad} x2={width - pad} y1={y(line)} y2={y(line)} stroke="#e5e5e5" strokeWidth="1" />
            <text x={0} y={y(line) + 3} fontSize="10" fill="#737373">{line}</text>
        </g>
      ))}
      <polyline points={points.join(" ")} fill="none" stroke="#000000" strokeWidth="2.5" />
      {series.map((point, index) => (
        <circle
          key={point.at}
          cx={pad + index * step}
          cy={y(point.score)}
          r="7"
          fill="transparent"
          tabIndex={0}
          aria-label={`${Math.round(point.score)}% on ${new Date(point.at).toLocaleDateString()}`}
          onMouseEnter={() => setHovered(index)}
          onFocus={() => setHovered(index)}
          onBlur={() => setHovered(null)}
        >
          <title>{`${Math.round(point.score)}% — ${new Date(point.at).toLocaleDateString()}`}</title>
        </circle>
      ))}
      {series.map((point, index) => (
        <circle key={`marker-${point.at}`} cx={pad + index * step} cy={y(point.score)} r="2.5" fill="#000000" pointerEvents="none" />
      ))}
      </svg>
      {hovered != null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-[3px] bg-black px-2 py-1 text-[11px] font-medium text-white"
          style={{ left: `${((pad + hovered * step) / width) * 100}%`, top: "0" }}
        >
          {Math.round(series[hovered].score)}% — {new Date(series[hovered].at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
