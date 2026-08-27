import { cn } from "@/lib/utils";
import { CompassMark } from "@/components/CompassMark";

const APP_NAME = "Compass";

type CompassLogoProps = {
  /** Show wordmark beside the mark */
  showName?: boolean;
  /** sm: nav; md: login; lg: hero */
  size?: "sm" | "md" | "lg";
  className?: string;
  /** Invert for dark backgrounds (white text) */
  inverted?: boolean;
};

const sizes = {
  sm: { mark: 34, text: "text-[15px]" },
  md: { mark: 48, text: "text-xl" },
  lg: { mark: 64, text: "text-2xl" },
} as const;

export function CompassLogo({
  showName = true,
  size = "sm",
  className,
  inverted = false,
}: CompassLogoProps) {
  const { mark, text } = sizes[size];

  return (
    <span className={cn("inline-flex items-center gap-2.5", className)}>
      <span className={cn("inline-flex shrink-0 items-center justify-center")}>
        <CompassMark size={mark} decorative={showName} />
      </span>
      {showName && (
        <span
          className={cn(
            "font-semibold tracking-tight",
            text,
            inverted ? "text-white" : "text-[var(--text-strong)]",
          )}
        >
          {APP_NAME}
        </span>
      )}
    </span>
  );
}

export { APP_NAME };
