"use client";

export type SeverityLevel = "error" | "warning" | "info" | "assisted" | "policy";

export function SeverityIcon({ level }: { level: SeverityLevel }) {
  if (level === "error") {
    return <span aria-hidden className="inline-block h-3 w-3 rounded-full" style={{ backgroundColor: "var(--sev-error)" }} />;
  }
  if (level === "warning") {
    return <span aria-hidden style={{ color: "var(--sev-warning)", fontSize: 12, lineHeight: "12px" }}>▲</span>;
  }
  if (level === "assisted") {
    return (
      <span
        aria-hidden
        className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
        style={{ backgroundColor: "var(--sev-assisted)" }}
      >
        i
      </span>
    );
  }
  if (level === "policy") {
    return <span aria-hidden className="inline-block h-3 w-3" style={{ backgroundColor: "var(--sev-policy)" }} />;
  }
  return (
    <span
      aria-hidden
      className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-[9px] font-bold text-white"
      style={{ backgroundColor: "var(--sev-info)" }}
    >
      i
    </span>
  );
}
