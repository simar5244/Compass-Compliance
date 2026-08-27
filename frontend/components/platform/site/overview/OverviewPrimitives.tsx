"use client";

import { useId } from "react";
import { Users } from "lucide-react";

import { InspectorScoreRing } from "@/components/inspector/InspectorScoreRing";

export type TrendPoint = { at: string; value: number };

export function bandLabel(score: number | null): string {
  if (score == null) return "";
  if (score >= 90) return "Great";
  if (score >= 70) return "Good";
  if (score >= 50) return "Fair";
  return "Poor";
}

/** The headline block every module overview opens with. */
export function ModuleOverviewHeader({
  title,
  description,
  audience,
  score,
}: {
  title: string;
  description: string;
  /** Who the module is for, e.g. "For people improving marketing". */
  audience: string;
  score: number | null;
}) {
  return (
    <section className="rounded-[6px] bg-white p-6 shadow-[0_2px_10px_rgba(45,61,80,0.10)]">
      <div className="flex items-start gap-6">
        <div className="flex flex-none flex-col items-center">
          <InspectorScoreRing score={score} size={104} stroke={8} />
          <span className="mt-1.5 text-[13px] font-medium text-[#5b626b]">{bandLabel(score)}</span>
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="text-[26px] font-semibold leading-8 text-[#1a1a2e]">{title}</h1>
          <p className="mt-1.5 text-[14px] leading-6 text-[#3f4650]">{description}</p>
          <hr className="my-4 border-[#e5e8ec]" />
          <p className="flex items-center gap-2 text-[13px] text-[#5b626b]">
            <Users aria-hidden className="h-4 w-4" /> {audience}
          </p>
        </div>
      </div>
    </section>
  );
}

/** A score with its movement since the previous run, as its own card. */
export function ScoreDeltaCard({
  title,
  score,
  delta,
}: {
  title: string;
  score: number | null;
  delta: number | null;
}) {
  return (
    <section className="rounded-[6px] bg-white shadow-[0_2px_10px_rgba(45,61,80,0.10)]">
      <h2 className="px-5 py-3.5 text-[15px] font-semibold text-[#1a1a2e]">{title}</h2>
      <div className="flex flex-col items-center border-t border-[#e5e8ec] px-5 py-7">
        <InspectorScoreRing score={score} size={84} stroke={7} />
        {delta != null && delta !== 0 && (
          <p className={`mt-2 text-[13px] font-medium ${delta > 0 ? "text-[#12805c]" : "text-[#c0392b]"}`}>
            {delta > 0 ? "↑ Up" : "↓ Down"} {Math.abs(delta).toFixed(2)}%
          </p>
        )}
        {delta === 0 && <p className="mt-2 text-[13px] text-[#6b7280]">No change since the last run</p>}
        {delta == null && score != null && (
          <p className="mt-2 text-[13px] text-[#6b7280]">No previous run to compare</p>
        )}
      </div>
    </section>
  );
}

/** The small score-over-time shape that sits beside the headline. */
export function ScoreSparkline({ points }: { points: TrendPoint[] }) {
  const titleId = useId();
  if (points.length < 2) {
    return <p className="py-8 text-center text-[12px] text-[#6b7280]">Not enough runs yet.</p>;
  }

  const width = 700;
  const height = 130;
  const padLeft = 34;
  const padBottom = 26;
  const padTop = 10;
  const step = (width - padLeft - 10) / (points.length - 1);
  const y = (score: number) => padTop + (1 - score / 100) * (height - padTop - padBottom);
  const line = points.map((point, index) => `${padLeft + index * step},${y(point.value)}`);
  const area = `${padLeft},${height - padBottom} ${line.join(" ")} ${padLeft + (points.length - 1) * step},${height - padBottom}`;
  const labelEvery = Math.ceil(points.length / 7);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[130px] w-full" role="img" aria-labelledby={titleId}>
      <title id={titleId}>Score over time</title>
      {[0, 50, 100].map((tick) => (
        <g key={tick}>
          <line x1={padLeft} x2={width - 10} y1={y(tick)} y2={y(tick)} stroke="#eceff3" strokeWidth="1" />
          <text x={0} y={y(tick) + 4} fontSize="11" fill="#8b9099">{tick}</text>
        </g>
      ))}
      <polygon points={area} fill="#eceff3" />
      <polyline points={line.join(" ")} fill="none" stroke="#1a1a2e" strokeWidth="1.5" />
      {points.map((point, index) =>
        index % labelEvery === 0 ? (
          <text key={point.at} x={padLeft + index * step} y={height - 8} textAnchor="middle" fontSize="11" fill="#8b9099">
            {shortDate(point.at)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/**
 * Several scored series on one 0–100 axis, with a legend. Used wherever a
 * screen tracks more than one score across the same runs.
 */
export function MultiLineChart<K extends string>({
  points,
  series,
  ariaLabel,
}: {
  points: ({ at: string } & Partial<Record<K, number | null>>)[];
  series: { key: K; label: string; color: string }[];
  ariaLabel: string;
}) {
  const titleId = useId();
  const usable = points.filter((point) => series.some((line) => point[line.key] != null));

  if (usable.length < 2) {
    return (
      <p className="py-12 text-center text-[13px] text-[#6b7280]">
        {usable.length === 0 ? "No completed runs yet." : "One run so far — a trend appears from the second run."}
      </p>
    );
  }

  const width = 960;
  const height = 230;
  const padLeft = 34;
  const padRight = 12;
  const padTop = 12;
  const padBottom = 40;
  const step = (width - padLeft - padRight) / (usable.length - 1);
  const y = (score: number) => padTop + (1 - score / 100) * (height - padTop - padBottom);
  const labelEvery = Math.ceil(usable.length / 8);

  return (
    <>
      <svg viewBox={`0 0 ${width} ${height}`} className="h-[230px] w-full" role="img" aria-labelledby={titleId}>
        <title id={titleId}>{ariaLabel}</title>
        {[0, 50, 100].map((tick) => (
          <g key={tick}>
            <line x1={padLeft} x2={width - padRight} y1={y(tick)} y2={y(tick)} stroke="#eceff3" strokeWidth="1" />
            <text x={0} y={y(tick) + 4} fontSize="11" fill="#8b9099">{tick}</text>
          </g>
        ))}
        {usable.map((point, index) =>
          index % labelEvery === 0 ? (
            <text key={point.at} x={padLeft + index * step} y={height - 18} textAnchor="middle" fontSize="10" fill="#8b9099">
              {shortDate(point.at)}
            </text>
          ) : null,
        )}
        {series.map((line) => {
          const drawn = usable
            .map((point, index) => ({
              value: (point[line.key] ?? null) as number | null,
              x: padLeft + index * step,
            }))
            .filter((p): p is { value: number; x: number } => p.value != null);
          if (drawn.length < 2) return null;
          return (
            <g key={line.key}>
              <polyline
                points={drawn.map((p) => `${p.x},${y(p.value)}`).join(" ")}
                fill="none"
                stroke={line.color}
                strokeWidth="2"
              />
              {drawn.map((p) => (
                <circle key={`${line.key}-${p.x}`} cx={p.x} cy={y(p.value)} r="3" fill={line.color} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="mt-2 flex flex-wrap items-center justify-center gap-6">
        {series.map((line) => (
          <span key={line.key} className="flex items-center gap-1.5 text-[12px] text-[#3f4650]">
            <span aria-hidden className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: line.color }} />
            {line.label}
          </span>
        ))}
      </div>
    </>
  );
}

/** A single unbounded quantity over time — word count, page count and the like. */
export function AreaTrend({
  points,
  color,
  fill,
  yLabel,
  ariaLabel,
}: {
  points: TrendPoint[];
  color: string;
  fill: string;
  yLabel: string;
  ariaLabel: string;
}) {
  const titleId = useId();
  if (points.length < 2) {
    return <p className="py-12 text-center text-[13px] text-[#6b7280]">Not enough runs yet.</p>;
  }

  const width = 960;
  const height = 300;
  const padLeft = 62;
  const padRight = 14;
  const padTop = 14;
  const padBottom = 46;
  const step = (width - padLeft - padRight) / (points.length - 1);

  const max = Math.max(...points.map((point) => point.value), 1);
  const tickStep = niceStep(max);
  const axisMax = Math.ceil(max / tickStep) * tickStep;
  const ticks = Array.from({ length: Math.floor(axisMax / tickStep) + 1 }, (_, i) => i * tickStep);
  const y = (value: number) => padTop + (1 - value / axisMax) * (height - padTop - padBottom);

  const line = points.map((point, index) => `${padLeft + index * step},${y(point.value)}`);
  const area = `${padLeft},${height - padBottom} ${line.join(" ")} ${padLeft + (points.length - 1) * step},${height - padBottom}`;
  const labelEvery = Math.ceil(points.length / 8);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[300px] w-full" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{ariaLabel}</title>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={padLeft} x2={width - padRight} y1={y(tick)} y2={y(tick)} stroke="#eceff3" strokeWidth="1" />
          <text x={padLeft - 8} y={y(tick) + 4} textAnchor="end" fontSize="11" fill="#8b9099">
            {compact(tick)}
          </text>
        </g>
      ))}
      <text
        x={14}
        y={padTop + (height - padTop - padBottom) / 2}
        fontSize="11"
        fill="#5b626b"
        transform={`rotate(-90 14 ${padTop + (height - padTop - padBottom) / 2})`}
        textAnchor="middle"
      >
        {yLabel}
      </text>
      <polygon points={area} fill={fill} />
      <polyline points={line.join(" ")} fill="none" stroke={color} strokeWidth="2" />
      {points.map((point, index) => (
        <circle key={point.at} cx={padLeft + index * step} cy={y(point.value)} r="3" fill={color}>
          <title>{`${new Date(point.at).toLocaleDateString()} — ${point.value.toLocaleString("en-US")}`}</title>
        </circle>
      ))}
      {points.map((point, index) =>
        index % labelEvery === 0 ? (
          <text
            key={`label-${point.at}`}
            x={padLeft + index * step}
            y={height - 20}
            textAnchor="middle"
            fontSize="11"
            fill="#8b9099"
          >
            {shortDate(point.at)}
          </text>
        ) : null,
      )}
    </svg>
  );
}

/** An empty result table, kept so the columns still explain what would appear. */
export function EmptyDataTable({
  title,
  columns,
  emptyMessage,
}: {
  title: string;
  columns: string[];
  emptyMessage: string;
}) {
  return (
    <section className="rounded-[6px] bg-white shadow-[0_2px_10px_rgba(45,61,80,0.10)]">
      <div className="flex items-center gap-2 px-5 py-4">
        <h2 className="text-[16px] font-semibold text-[#1a1a2e]">{title}</h2>
        <span className="rounded-full bg-[#eceff3] px-2.5 py-0.5 text-[13px] font-semibold text-[#3f4650]">0</span>
      </div>
      <table className="w-full border-t border-[#e5e8ec] text-left">
        <thead>
          <tr className="bg-[#fafbfc] text-[13px] text-[#5b626b]">
            {columns.map((column, index) => (
              <th
                key={column}
                scope="col"
                className={`px-5 py-3 font-medium ${index === columns.length - 1 ? "text-right" : ""}`}
              >
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={columns.length} className="px-5 py-8 text-center text-[13px] text-[#6b7280]">
              {emptyMessage}
            </td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function compact(value: number): string {
  if (value >= 1000) return `${value / 1000}k`;
  return String(value);
}

/** A round axis step (1, 2, 5, 10, 20, …) that keeps tick labels readable. */
function niceStep(max: number): number {
  const rough = max / 6;
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  for (const multiple of [1, 2, 5, 10]) {
    if (magnitude * multiple >= rough) return magnitude * multiple;
  }
  return magnitude * 10;
}
