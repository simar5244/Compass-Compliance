"use client";

/** Small shared platform UI atoms: score ring, delta chip, sparkline, severity
 * icon, band helpers. Colors come from CSS variables so they adapt to theme. */

import { severityIcon } from "@/lib/report";

export function bandLabel(score: number | null | undefined): string {
  if (score == null) return "—";
  if (score >= 90) return "Excellent";
  if (score >= 80) return "Great";
  if (score >= 60) return "Good";
  if (score >= 50) return "Fair";
  if (score >= 30) return "Poor";
  return "Very poor";
}

export function ringColor(score: number | null | undefined): string {
  if (score == null) return "#9ca3af";
  // Silktide-style band colors (platform only):
  // 0–49 red, 50–69 amber, 70–84 green, 85–100 teal/blue.
  if (score >= 85) return "var(--score-teal)";
  if (score >= 70) return "var(--score-green)";
  if (score >= 50) return "var(--score-amber)";
  return "var(--score-red)";
}

export function ScoreRing({ score, size = 44, stroke = 3 }: { score: number | null; size?: number; stroke?: number }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - (score ?? 0) / 100);
  const color = ringColor(score);
  return (
    <span
      className="relative inline-flex flex-none items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score == null ? "No score" : `Score ${Math.round(score)} out of 100`}
    >
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--border-soft)" strokeWidth={stroke} />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke}
          strokeDasharray={c} strokeDashoffset={offset} strokeLinecap="round"
          style={{ transition: "stroke-dashoffset .4s ease" }}
        />
      </svg>
      <span className="absolute font-semibold" style={{ fontSize: size / 3.4, color }}>
        {score == null ? "—" : `${Math.round(score)}%`}
      </span>
    </span>
  );
}

export function DeltaChip({ delta }: { delta: number | null | undefined }) {
  if (delta == null) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  const up = delta > 0;
  const flat = delta === 0;
  const color = flat ? "var(--text-muted)" : up ? "var(--score-green)" : "var(--sev-error)";
  const bg = flat ? "var(--surface-2)" : up ? "color-mix(in srgb, var(--score-green) 12%, transparent)" : "color-mix(in srgb, var(--sev-error) 12%, transparent)";
  return (
    <span
      className="inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold"
      style={{ color, backgroundColor: bg }}
      aria-label={`${up ? "up" : flat ? "no change" : "down"} ${Math.abs(delta)}`}
    >
      {flat ? "±0" : `${up ? "+" : "−"}${Math.abs(delta)}`}
    </span>
  );
}

export function Sparkline({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  if (!values.length) return <span className="text-xs text-[var(--text-muted)]">no history</span>;
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 100);
  const span = max - min || 1;
  const step = values.length > 1 ? width / (values.length - 1) : 0;
  const pts = values.map((v, i) => `${i * step},${height - ((v - min) / span) * height}`).join(" ");
  const last = values[values.length - 1];
  return (
    <svg width={width} height={height} aria-label="Score trend" role="img" className="overflow-visible">
      <polyline points={pts} fill="none" stroke={ringColor(last)} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

export function SevIcon({ impact }: { impact: string | null }) {
  const s = severityIcon(impact);
  if (s.shape === "triangle") return <span aria-hidden style={{ color: s.color }}>▲</span>;
  if (s.shape === "info")
    return (
      <span aria-hidden className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: s.color }}>i</span>
    );
  return <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />;
}

export function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const then = new Date(iso).getTime();
  const s = Math.floor((Date.now() - then) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d}d ago`;
  return new Date(iso).toLocaleDateString();
}

export const CATEGORY_ORDER = ["content", "accessibility", "marketing", "ux", "privacy", "policies", "inventory"] as const;
export const CATEGORY_LABEL: Record<string, string> = {
  content: "Content", accessibility: "Accessibility", marketing: "Marketing",
  ux: "User Experience", privacy: "Privacy", policies: "Policies", inventory: "Inventory",
};
export const SCORED_CATEGORIES = new Set(["content", "accessibility", "marketing", "ux", "privacy"]);
