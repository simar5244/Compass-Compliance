"use client";

export function DeltaIndicator({ value }: { value: number | null | undefined }) {
  if (value == null) return <span className="text-xs text-[var(--text-muted)]">—</span>;
  const up = value > 0;
  const down = value < 0;
  const color = up ? "var(--score-green)" : down ? "var(--sev-error)" : "var(--text-muted)";
  const arrow = up ? "↑" : down ? "↓" : "→";
  const pct = Math.abs(value).toFixed(0);
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold tabular-nums" style={{ color }}>
      <span aria-hidden>{arrow}</span>
      <span>{pct}%</span>
    </span>
  );
}
