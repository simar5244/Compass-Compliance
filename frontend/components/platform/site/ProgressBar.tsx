"use client";

export function ProgressBar({ value }: { value: number | null | undefined }) {
  const v = Math.max(0, Math.min(100, Math.round(value ?? 0)));
  return (
    <div className="flex items-center gap-2" aria-label={value == null ? "No progress" : `Progress ${v}%`}>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ backgroundColor: "var(--border)" }}>
        <div className="h-full rounded-full" style={{ width: `${v}%`, backgroundColor: "var(--brand)", transition: "width .5s ease" }} />
      </div>
      <div className="w-10 text-right text-xs font-semibold tabular-nums" style={{ color: "var(--text-muted)" }}>
        {value == null ? "—" : `${v}%`}
      </div>
    </div>
  );
}
