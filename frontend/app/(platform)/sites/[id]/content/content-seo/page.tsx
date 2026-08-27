"use client";

import { CompassLoader } from "@/components/CompassLoader";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";

import { getModuleHistory, getSiteChecksFull, type SiteCheckRow } from "@/lib/auth";
import { ContentWithIssuesTab, ModuleCheckTable } from "@/components/platform/site/ModuleCheckList";

const TABS = ["Checks", "Content with issues"] as const;

export default function ContentSEOPage() {
  const params = useParams<{ id: string }>();
  const [loaded, setLoaded] = useState<{ key: string; checks: SiteCheckRow[] | null; error: string | null }>({
    key: "", checks: null, error: null,
  });
  const [series, setSeries] = useState<{ at: string; score: number }[]>([]);
  const [tab, setTab] = useState<string>(TABS[0]);

  const requestKey = params.id;
  const fresh = loaded.key === requestKey ? loaded : null;
  const checks = fresh?.checks ?? null;
  const error = fresh?.error ?? null;

  useEffect(() => {
    let cancelled = false;
    getSiteChecksFull(params.id, "content-seo")
      .then((r) => { if (!cancelled) setLoaded({ key: requestKey, checks: r.checks, error: null }); })
      .catch((e) => {
        if (!cancelled) {
          setLoaded({
            key: requestKey, checks: null,
            error: e instanceof Error ? e.message : "Failed to load content SEO",
          });
        }
      });
    getModuleHistory(params.id, "content-seo")
      .then((r) => {
        if (!cancelled) setSeries(r.points.map((p) => ({ at: p.at, score: p.score })));
      })
      .catch(() => { if (!cancelled) setSeries([]); });
    return () => { cancelled = true; };
  }, [params.id, requestKey]);

  const latest = series.at(-1)?.score ?? null;
  const previous = series.length > 1 ? series.at(-2)!.score : null;
  const delta = latest != null && previous != null ? latest - previous : null;
  const issueCount = useMemo(
    () => (checks ?? []).reduce((sum, row) => sum + (row.issues ?? 0), 0),
    [checks],
  );

  if (error) {
    return (
      <div className="bg-white px-8 py-10 text-black">
        <p className="text-sm text-[#525252]">{error}</p>
      </div>
    );
  }
  if (!checks) return <CompassLoader fullPage label="Loading content SEO…" />;

  return (
    <div className="light-theme bg-white text-black">
      <section className="border-b border-[#e5e5e5] px-6 py-10 lg:px-12">
        <p className="text-[11px] uppercase tracking-[0.18em] text-[#737373]">Content</p>
        <h1 className="mt-3 max-w-[18ch] text-[40px] font-semibold leading-[0.95] tracking-[-0.04em] lg:text-[56px]">
          Content SEO
        </h1>
        <p className="mt-5 max-w-[68ch] text-[15px] leading-7 text-[#525252]">
          Improve the SEO of content on this site. Technical crawl issues are left aside so editors
          can focus on titles, descriptions, headings, and copy that search engines actually read.
        </p>
        <dl className="mt-8 flex flex-wrap gap-10">
          <div>
            <dt className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">Score</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">
              {latest == null ? "—" : `${Math.round(latest)}%`}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">Issues</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">{issueCount.toLocaleString("en-US")}</dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-[0.16em] text-[#737373]">Change</dt>
            <dd className="mt-1 text-3xl font-semibold tabular-nums">
              {delta == null || delta === 0
                ? "—"
                : `${delta > 0 ? "+" : ""}${delta.toFixed(1)}`}
            </dd>
          </div>
        </dl>
      </section>

      <div className="grid gap-0 border-b border-[#e5e5e5] lg:grid-cols-[minmax(0,240px)_minmax(0,1fr)]">
        <section className="flex flex-col items-center border-b border-[#e5e5e5] px-6 py-10 lg:border-b-0 lg:border-r">
          <h2 className="mb-6 self-start text-[11px] uppercase tracking-[0.18em] text-[#737373]">
            Content SEO
          </h2>
          <MonoScoreRing score={latest} />
          {delta != null && delta !== 0 && (
            <p className="mt-4 text-sm text-[#525252]">
              {delta > 0 ? "Up" : "Down"} {Math.abs(delta).toFixed(2)} since last run
            </p>
          )}
          {delta === null && latest != null && (
            <p className="mt-4 text-sm text-[#737373]">No previous run to compare</p>
          )}
        </section>
        <section className="px-6 py-8 lg:px-10">
          <h2 className="mb-4 text-[11px] uppercase tracking-[0.18em] text-[#737373]">
            Content SEO over time
          </h2>
          <ScoreTrend series={series} />
        </section>
      </div>

      <div className="px-6 py-8 lg:px-12">
        <div className="flex border-b border-[#e5e5e5]">
          {TABS.map((item) => (
            <button
              key={item}
              type="button"
              onClick={() => setTab(item)}
              aria-current={item === tab ? "page" : undefined}
              className={`mr-8 border-b-2 px-0 py-3 text-sm font-medium ${
                item === tab
                  ? "border-black text-black"
                  : "border-transparent text-[#737373] hover:text-black"
              }`}
            >
              {item}
            </button>
          ))}
        </div>
        <div className="border border-t-0 border-[#e5e5e5] bg-white">
          {tab === "Checks" ? (
            <ModuleCheckTable checks={checks} />
          ) : (
            <ContentWithIssuesTab checks={checks} heading="Content with issues" />
          )}
        </div>
      </div>
    </div>
  );
}

function MonoScoreRing({ score }: { score: number | null }) {
  const size = 104;
  const stroke = 7;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score ?? 0) / 100);

  return (
    <span
      className="relative inline-flex"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score == null ? "No score" : `Score ${Math.round(score)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="white" stroke="#e5e5e5" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#111111"
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
        />
      </svg>
      <span className="absolute inset-0 grid place-items-center text-[22px] font-semibold tabular-nums">
        {score == null ? "—" : `${Math.round(score)}%`}
      </span>
    </span>
  );
}

function ScoreTrend({ series }: { series: { at: string; score: number }[] }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (series.length === 0) {
    return <p className="py-10 text-center text-sm text-[#737373]">No completed runs yet.</p>;
  }
  if (series.length === 1) {
    return (
      <p className="py-10 text-center text-sm text-[#737373]">
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
        <polyline points={points.join(" ")} fill="none" stroke="#111111" strokeWidth="2" />
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
          />
        ))}
        {series.map((point, index) => (
          <circle
            key={`marker-${point.at}`}
            cx={pad + index * step}
            cy={y(point.score)}
            r="2.5"
            fill="#111111"
            pointerEvents="none"
          />
        ))}
      </svg>
      {hovered != null && (
        <div
          role="status"
          className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap bg-black px-2 py-1 text-[11px] font-medium text-white"
          style={{ left: `${((pad + hovered * step) / width) * 100}%`, top: "0" }}
        >
          {Math.round(series[hovered].score)}% — {new Date(series[hovered].at).toLocaleDateString()}
        </div>
      )}
    </div>
  );
}
