"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { getCheckHistory, getSiteChecksFull, type CheckHistoryPoint } from "@/lib/auth";

type Metric = "issues" | "score";

/**
 * The frame every individual check screen shares: what the check is, how far
 * the site has got with it, how it has moved across runs, and the tab strip
 * above the screen's own table.
 */
export function CheckDetailShell({
  checkId,
  title,
  intro,
  tabs,
  assisted,
  issuesFound,
  activeTab,
  onTabChange,
  children,
}: {
  /** Rule id, used for the progress figure and the trend. */
  checkId: string;
  title: string;
  intro: string;
  tabs: readonly string[];
  /** Assisted checks surface findings for a person to judge; they are not scored. */
  assisted?: boolean;
  /**
   * What to report as found, when the screen lists something other than raw
   * findings. A check that flags one issue per page but presents the distinct
   * phone numbers behind them should headline the count a reviewer works
   * through, not the page tally.
   */
  issuesFound?: number;
  activeTab: string;
  onTabChange: (tab: string) => void;
  children: React.ReactNode;
}) {
  const params = useParams<{ id: string }>();
  const [points, setPoints] = useState<CheckHistoryPoint[] | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [metric, setMetric] = useState<Metric>("issues");
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getCheckHistory(params.id, checkId)
      .then((r) => { if (!cancelled) setPoints(r.points); })
      .catch(() => { if (!cancelled) setPoints([]); });
    getSiteChecksFull(params.id)
      .then((r) => {
        if (cancelled) return;
        const row = r.checks.find((c) => c.check_id === checkId);
        setProgress(row?.progress ?? null);
      })
      .catch(() => { if (!cancelled) setProgress(null); });
    return () => { cancelled = true; };
  }, [params.id, checkId]);

  const latest = points?.at(-1) ?? null;
  const found =
    issuesFound != null
      ? issuesFound
      : latest
        ? latest.issues
        : null;

  return (
    <div className="light-theme bg-white text-black">
      <header className="px-6 py-10 lg:px-12 lg:py-14">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">
          {assisted ? "Assisted check" : "Automated check"}
        </p>
        <h1 className="mt-3 max-w-[18ch] text-[40px] font-semibold leading-[0.95] tracking-[-0.04em] lg:text-[56px]">
          {title}
        </h1>

        <div className="mt-10 grid gap-3 lg:grid-cols-12">
          <section className="flex min-h-[180px] flex-col justify-between border border-[#e5e5e5] bg-[#fafafa] p-6 lg:col-span-5">
            <p className={`max-w-[62ch] text-sm leading-6 text-[#525252] ${expanded ? "" : "line-clamp-4"}`}>
              {intro}
            </p>
            <button
              type="button"
              onClick={() => setExpanded((previous) => !previous)}
              className="mt-4 self-start text-sm font-medium text-black underline underline-offset-4"
            >
              {expanded ? "Show less" : "Show more"}
            </button>
          </section>

          <section className="flex min-h-[180px] flex-col justify-between bg-black p-6 text-white lg:col-span-4">
            <span className="text-[11px] uppercase tracking-[0.18em] text-white/45">Issues found</span>
            <div className="text-[56px] font-semibold leading-none tracking-[-0.05em] tabular-nums lg:text-[64px]">
              {found == null ? "—" : found.toLocaleString("en-US")}
            </div>
          </section>

          <section className="flex min-h-[180px] flex-col justify-between border border-[#e5e5e5] p-6 lg:col-span-3">
            <span className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Progress</span>
            <div>
              <div className="text-[40px] font-semibold leading-none tracking-[-0.04em] tabular-nums">
                {progress == null ? "—" : `${Math.round(progress)}%`}
              </div>
              <div
                className="mt-4 h-1.5 overflow-hidden bg-[#f5f5f5]"
                role="progressbar"
                aria-valuenow={progress ?? undefined}
                aria-valuemin={0}
                aria-valuemax={100}
                aria-label="Progress"
              >
                <div
                  className="h-full bg-black transition-[width] duration-500"
                  style={{ width: `${Math.max(0, Math.min(100, Math.round(progress ?? 0)))}%` }}
                />
              </div>
            </div>
          </section>

          <section className="border border-[#e5e5e5] p-5 lg:col-span-12">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <h2 className="text-base font-semibold">
                {metric === "issues" ? "Number of issues over time" : "Score over time"}
              </h2>
              <div className="flex border border-[#e5e5e5]">
                {(["issues", "score"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    onClick={() => setMetric(option)}
                    className={`px-3 py-1.5 text-[13px] font-medium ${
                      metric === option ? "bg-black text-white" : "bg-white text-[#737373] hover:text-black"
                    }`}
                  >
                    {option === "issues" ? "Number of issues" : "Score"}
                  </button>
                ))}
              </div>
            </div>
            <HistoryChart points={points} metric={metric} />
          </section>
        </div>
      </header>

      <div className="px-6 pb-12 lg:px-12">
        <div className="flex gap-1 border-b border-[#e5e5e5]">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => onTabChange(tab)}
              aria-current={tab === activeTab ? "page" : undefined}
              className={`px-4 py-3 text-sm font-medium ${
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

function HistoryChart({ points, metric }: { points: CheckHistoryPoint[] | null; metric: Metric }) {
  const usable = useMemo(
    () => (points ?? []).filter((p) => (metric === "issues" ? true : p.score != null)),
    [points, metric],
  );

  if (points === null) {
    return <p className="py-10 text-center text-[13px] text-[#737373]">Loading history…</p>;
  }
  if (usable.length < 2) {
    return (
      <p className="py-10 text-center text-[13px] text-[#737373]">
        {usable.length === 0
          ? "No completed runs yet."
          : "One run so far — a trend appears from the second run."}
      </p>
    );
  }

  const width = 900;
  const height = 190;
  const pad = 34;
  const values = usable.map((p) => (metric === "issues" ? p.issues : (p.score ?? 0)));
  const max = metric === "score" ? 100 : Math.max(...values, 1);
  const step = (width - pad * 2) / (usable.length - 1);
  const y = (value: number) => pad + (1 - value / max) * (height - pad * 2);
  const line = usable.map((p, i) => `${pad + i * step},${y(metric === "issues" ? p.issues : (p.score ?? 0))}`);
  const area = `${pad},${height - pad} ${line.join(" ")} ${pad + (usable.length - 1) * step},${height - pad}`;
  const ticks = [0, Math.round(max / 2), max];

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[190px] w-full" role="img"
         aria-label={metric === "issues" ? "Number of issues over time" : "Score over time"}>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={pad} x2={width - pad} y1={y(tick)} y2={y(tick)} stroke="#e5e5e5" strokeWidth="1" />
          <text x={0} y={y(tick) + 4} fontSize="11" fill="#737373">{tick}</text>
        </g>
      ))}
      <polygon points={area} fill="#f5f5f5" />
      <polyline points={line.join(" ")} fill="none" stroke="#171717" strokeWidth="2" />
      {usable.map((p, i) => (
        <circle key={p.scan_id} cx={pad + i * step} cy={y(metric === "issues" ? p.issues : (p.score ?? 0))} r="2.5" fill="#171717">
          <title>{`${new Date(p.at).toLocaleDateString()} — ${metric === "issues" ? `${p.issues} issues` : `${p.score}%`}`}</title>
        </circle>
      ))}
    </svg>
  );
}
