"use client";

import { useId } from "react";

import type { AccessibilityOverview } from "@/lib/auth";

/** Slice greys, worst-first, with a light tail for the pooled remainder. */
const SLICE_COLORS = ["#171717", "#404040", "#737373", "#a3a3a3", "#d4d4d4"];

export const LEVEL_COLORS = { a: "#171717", aa: "#525252", aaa: "#a3a3a3" } as const;

const TAU = Math.PI * 2;

function formatCount(value: number): string {
  return value.toLocaleString("en-US", { maximumFractionDigits: 2 });
}

function donutPath(
  cx: number,
  cy: number,
  outer: number,
  inner: number,
  start: number,
  end: number,
): string {
  const large = end - start > Math.PI ? 1 : 0;
  const ox0 = cx + outer * Math.cos(start);
  const oy0 = cy + outer * Math.sin(start);
  const ox1 = cx + outer * Math.cos(end);
  const oy1 = cy + outer * Math.sin(end);
  const ix1 = cx + inner * Math.cos(end);
  const iy1 = cy + inner * Math.sin(end);
  const ix0 = cx + inner * Math.cos(start);
  const iy0 = cy + inner * Math.sin(start);
  return [
    `M ${ox0} ${oy0}`,
    `A ${outer} ${outer} 0 ${large} 1 ${ox1} ${oy1}`,
    `L ${ix1} ${iy1}`,
    `A ${inner} ${inner} 0 ${large} 0 ${ix0} ${iy0}`,
    "Z",
  ].join(" ");
}

/**
 * Share of findings per check, biggest first. A grayscale donut plus a legend
 * so thin slices stay readable without leader lines.
 */
export function CommonIssuesPie({ issues }: { issues: AccessibilityOverview["common_issues"] }) {
  const titleId = useId();
  const total = issues.reduce((sum, slice) => sum + slice.issues, 0);

  if (total === 0) {
    return <p className="py-16 text-center text-[13px] text-[#737373]">No accessibility findings.</p>;
  }

  const size = 220;
  const cx = size / 2;
  const cy = size / 2;
  const outer = 88;
  const inner = 52;

  let angle = -Math.PI / 2;
  const slices = issues.map((slice, index) => {
    const sweep = (slice.issues / total) * TAU;
    const start = angle;
    const end = angle + sweep;
    angle = end;
    return {
      ...slice,
      path: donutPath(cx, cy, outer, inner, start, end),
      color: SLICE_COLORS[Math.min(index, SLICE_COLORS.length - 1)],
      percent: (slice.issues / total) * 100,
    };
  });

  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start">
      <svg
        viewBox={`0 0 ${size} ${size}`}
        className="h-[220px] w-[220px] flex-none"
        role="img"
        aria-labelledby={titleId}
      >
        <title id={titleId}>
          Most common accessibility issues: {slices.map((s) => `${s.name} ${Math.round(s.percent)}%`).join(", ")}
        </title>
        {slices.map((slice) => (
          <path key={slice.rule_id} d={slice.path} fill={slice.color} />
        ))}
        <text x={cx} y={cy - 6} textAnchor="middle" fontSize="22" fontWeight="600" fill="#171717">
          {formatCount(total)}
        </text>
        <text x={cx} y={cy + 14} textAnchor="middle" fontSize="11" fill="#737373">
          issues
        </text>
      </svg>
      <ul className="min-w-0 flex-1 space-y-2 self-center">
        {slices.map((slice) => (
          <li key={slice.rule_id} className="flex items-start gap-2.5 text-[13px]">
            <span
              aria-hidden
              className="mt-1 h-2.5 w-2.5 flex-none rounded-[3px]"
              style={{ backgroundColor: slice.color }}
            />
            <span className="min-w-0 flex-1 truncate text-[#171717]" title={slice.name}>
              {slice.name}
            </span>
            <span className="flex-none tabular-nums text-[#525252]">
              {formatCount(slice.issues)} · {Math.round(slice.percent)}%
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * Mean findings per page, overall and by how many clicks a page sits from the
 * homepage. The overall bar is set apart in black so it is not read as a depth.
 */
export function IssuesPerPageBars({ rows }: { rows: AccessibilityOverview["issues_per_page"] }) {
  const titleId = useId();
  if (rows.length === 0) {
    return <p className="py-16 text-center text-[13px] text-[#737373]">No pages in the latest scan.</p>;
  }

  const rowHeight = 28;
  const gap = 12;
  const padLeft = 108;
  const padRight = 56;
  const padTop = 8;
  const axisHeight = 34;
  const width = 940;
  const height = padTop + rows.length * (rowHeight + gap) + axisHeight;
  const plotWidth = width - padLeft - padRight;

  const max = Math.max(...rows.map((row) => row.average), 1);
  const step = niceStep(max);
  const axisMax = Math.ceil(max / step) * step;
  const ticks = Array.from({ length: Math.floor(axisMax / step) + 1 }, (_, i) => i * step);
  const x = (value: number) => padLeft + (value / axisMax) * plotWidth;

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full" style={{ height }} role="img" aria-labelledby={titleId}>
      <title id={titleId}>
        Average accessibility issues per page: {rows.map((r) => `${r.label} ${r.average}`).join(", ")}
      </title>
      {ticks.map((tick) => (
        <g key={tick}>
          <line x1={x(tick)} x2={x(tick)} y1={padTop} y2={height - axisHeight} stroke="#f5f5f5" strokeWidth="1" />
          <text x={x(tick)} y={height - axisHeight + 16} textAnchor="middle" fontSize="11" fill="#a3a3a3">
            {tick}
          </text>
        </g>
      ))}
      <text x={padLeft + plotWidth / 2} y={height - 4} textAnchor="middle" fontSize="11" fill="#737373">
        Issues
      </text>

      {rows.map((row, index) => {
        const y = padTop + index * (rowHeight + gap);
        const barWidth = Math.max(x(row.average) - padLeft, row.average > 0 ? 2 : 0);
        return (
          <g key={row.label}>
            <text x={padLeft - 12} y={y + rowHeight / 2 + 4} textAnchor="end" fontSize="12" fill="#525252">
              {row.label}
            </text>
            <rect
              x={padLeft}
              y={y}
              width={barWidth}
              height={rowHeight}
              fill={row.is_total ? "#171717" : "#a3a3a3"}
              rx="3"
            />
            <text
              x={padLeft + barWidth + 8}
              y={y + rowHeight / 2 + 4}
              fontSize="12"
              fill="#171717"
            >
              {formatCount(row.average)}
            </text>
          </g>
        );
      })}
    </svg>
  );
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
