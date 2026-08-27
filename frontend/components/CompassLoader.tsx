import { cn } from "@/lib/utils";
import { CompassMark } from "@/components/CompassMark";

type CompassLoaderProps = {
  /** Accessible status message */
  label?: string;
  /** sm: inline; md: page; lg: full-screen gate */
  size?: "sm" | "md" | "lg";
  className?: string;
  fullPage?: boolean;
};

const markSizes = { sm: 24, md: 40, lg: 56 } as const;

/** Branded loading indicator — animated Double T with compass ring. */
export function CompassLoader({
  label = "Loading…",
  size = "md",
  className,
  fullPage = false,
}: CompassLoaderProps) {
  const mark = markSizes[size];

  const content = (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className={cn("flex flex-col items-center gap-4", className)}
    >
      <div className="relative grid place-items-center" style={{ width: mark + 24, height: mark + 24 }}>
        <span
          className="absolute inset-0 animate-spin border-2 border-[var(--border-soft)] border-t-black dark:border-t-white"
          aria-hidden
        />
        <span
          className="absolute inset-1 animate-spin border border-dashed border-[var(--text-muted)]/40"
          style={{ animationDirection: "reverse", animationDuration: "2.5s" }}
          aria-hidden
        />
        <CompassMark size={mark} decorative className="relative z-10 animate-pulse" />
      </div>
      {label ? (
        <p className="text-sm font-medium text-[var(--text-muted)]">{label}</p>
      ) : null}
    </div>
  );

  if (fullPage) {
    return (
      <div className="flex min-h-[12rem] flex-1 items-center justify-center p-8">{content}</div>
    );
  }

  return content;
}
