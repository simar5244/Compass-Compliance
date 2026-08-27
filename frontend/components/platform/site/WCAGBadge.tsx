"use client";

export function WCAGBadge({ version, level, criterionId }: { version: string | null; level: string | null; criterionId: string | null }) {
  if (!version || !level || !criterionId) return null;
  return (
    <span
      className="inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold"
      style={{ backgroundColor: "var(--surface-2)", color: "var(--text-muted)" }}
    >
      WCAG {version} {level} {criterionId}
    </span>
  );
}
