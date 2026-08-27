"use client";

import { useId } from "react";

/** Google's Core Web Vitals bands: good, needs improvement, poor. */
export type VitalBands = { good: number; poor: number; max: number };

const ARC_COLORS = { good: "#171717", warn: "#737373", poor: "#d4d4d4" };

/**
 * A vital as a speedometer: the three bands sized by Google's thresholds, with
 * a needle at the measured value. A value past the end of the scale pins the
 * needle at the far edge rather than swinging off the dial.
 */
export function VitalGauge({
  value,
  bands,
  label,
}: {
  /** Measured value in the vital's own unit; null when nothing was measured. */
  value: number | null;
  bands: VitalBands;
  /** Accessible description of what is being shown. */
  label: string;
}) {
  const titleId = useId();
  const width = 260;
  const height = 150;
  const cx = width / 2;
  const cy = 128;
  const radius = 92;
  const thickness = 22;

  // The dial sweeps a half circle, left (0) to right (max).
  const angleFor = (amount: number) => Math.PI * (1 - Math.min(Math.max(amount / bands.max, 0), 1));

  const arc = (from: number, to: number, color: string) => {
    const start = angleFor(from);
    const end = angleFor(to);
    const outer = radius;
    const inner = radius - thickness;
    const large = start - end > Math.PI ? 1 : 0;
    return (
      <path
        key={color}
        d={[
          `M ${cx + outer * Math.cos(start)} ${cy - outer * Math.sin(start)}`,
          `A ${outer} ${outer} 0 ${large} 1 ${cx + outer * Math.cos(end)} ${cy - outer * Math.sin(end)}`,
          `L ${cx + inner * Math.cos(end)} ${cy - inner * Math.sin(end)}`,
          `A ${inner} ${inner} 0 ${large} 0 ${cx + inner * Math.cos(start)} ${cy - inner * Math.sin(start)}`,
          "Z",
        ].join(" ")}
        fill={color}
      />
    );
  };

  const needleAngle = value == null ? null : angleFor(value);

  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="h-[150px] w-full" role="img" aria-labelledby={titleId}>
      <title id={titleId}>{label}</title>
      {arc(0, bands.good, ARC_COLORS.good)}
      {arc(bands.good, bands.poor, ARC_COLORS.warn)}
      {arc(bands.poor, bands.max, ARC_COLORS.poor)}
      {needleAngle != null && (
        <polygon
          points={[
            `${cx + 5 * Math.cos(needleAngle - Math.PI / 2)},${cy - 5 * Math.sin(needleAngle - Math.PI / 2)}`,
            `${cx + 5 * Math.cos(needleAngle + Math.PI / 2)},${cy - 5 * Math.sin(needleAngle + Math.PI / 2)}`,
            `${cx + (radius - 8) * Math.cos(needleAngle)},${cy - (radius - 8) * Math.sin(needleAngle)}`,
          ].join(" ")}
          fill="#000000"
        />
      )}
      <circle cx={cx} cy={cy} r="6" fill="#000000" />
    </svg>
  );
}
