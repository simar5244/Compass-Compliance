"use client";

export type Tab = { key: string; label: string };

export function ContentTabs({
  tabs,
  active,
  onChange,
}: {
  tabs: Tab[];
  active: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1 border-b" style={{ borderColor: "var(--border-soft)" }}>
      {tabs.map((t) => {
        const isActive = t.key === active;
        return (
          <button
            type="button"
            key={t.key}
            onClick={() => onChange(t.key)}
            className="rounded-none border-b-2 px-3 py-2 text-sm font-semibold"
            style={{
              backgroundColor: "transparent",
              borderColor: isActive ? "var(--brand)" : "transparent",
              color: isActive ? "var(--brand)" : "var(--text-muted)",
            }}
            aria-current={isActive ? "page" : undefined}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
