import Image from "next/image";
import { cn } from "@/lib/utils";
import compassLogo from "../public/compass-logo.png";

type CompassMarkProps = {
  className?: string;
  /** Render height in px; width scales from the asset aspect ratio. */
  size?: number;
  /** When true, hides from screen readers (parent provides context). */
  decorative?: boolean;
};

const LOGO_ASPECT = compassLogo.width / compassLogo.height;

/** Texas Tech Double T — bundled PNG so it renders under `/compass` basePath. */
export function CompassMark({ className, size = 32, decorative = false }: CompassMarkProps) {
  const height = size;
  const width = Math.round(size * LOGO_ASPECT);

  return (
    <Image
      src={compassLogo}
      alt={decorative ? "" : "Texas Tech"}
      width={width}
      height={height}
      className={cn("shrink-0 object-contain", className)}
      aria-hidden={decorative || undefined}
      priority
    />
  );
}
