"use client";

import {
  Area,
  AreaChart as RCAreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

type Point = Record<string, number | string | null | undefined>;

export function AreaChart({
  data,
  xKey,
  yKey,
  color,
  height = 140,
  ariaLabel,
  valueFormatter,
}: {
  data: Point[];
  xKey: string;
  yKey: string;
  color: string;
  height?: number;
  ariaLabel: string;
  valueFormatter?: (v: unknown) => string;
}) {
  const fmt = valueFormatter ?? ((v) => (v == null ? "—" : String(v)));
  return (
    <div className="p-4" style={{ width: "100%", height }} role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <RCAreaChart data={data} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${yKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.25} />
              <stop offset="95%" stopColor={color} stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="var(--border-soft)" strokeDasharray="4 4" vertical={false} />
          <XAxis
            dataKey={xKey}
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border-soft)" }}
            tickLine={false}
          />
          <YAxis
            tick={{ fill: "var(--text-muted)", fontSize: 11 }}
            axisLine={{ stroke: "var(--border-soft)" }}
            tickLine={false}
            width={34}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "var(--surface)", border: "1px solid var(--border-soft)", borderRadius: 10 }}
            labelStyle={{ color: "var(--text-muted)", fontSize: 12 }}
            formatter={(v) => fmt(v)}
          />
          <Area
            type="monotone"
            dataKey={yKey}
            stroke={color}
            strokeWidth={2}
            fill={`url(#fill-${yKey})`}
            dot={false}
            isAnimationActive={false}
          />
        </RCAreaChart>
      </ResponsiveContainer>
    </div>
  );
}
