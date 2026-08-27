"use client";

function inspectorRingColor(score: number | null): string {
  if (score == null) return "#737373";
  if (score >= 85) return "#000000";
  if (score >= 70) return "#262626";
  if (score >= 50) return "#525252";
  return "#737373";
}

export function InspectorScoreRing({
  score,
  size = 52,
  stroke = 4,
  showValue = true,
}: {
  score: number | null;
  size?: number;
  stroke?: number;
  showValue?: boolean;
}) {
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const color = inspectorRingColor(score);

  return (
    <span
      className="relative inline-flex flex-none items-center justify-center"
      style={{ width: size, height: size }}
      role="img"
      aria-label={score == null ? "No score" : `Score ${Math.round(score)} percent`}
    >
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="#ffffff"
          stroke="#e5e5e5"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - (score ?? 0) / 100)}
          strokeLinecap="round"
        />
      </svg>
      {showValue && (
        <span
          className="absolute font-bold text-black"
          style={{ fontSize: Math.max(9, size / 3.9), textShadow: "0 1px 0 #fff" }}
        >
          {score == null ? "—" : Math.round(score)}
          {score != null && <span className="ml-px align-top text-[0.58em]">%</span>}
        </span>
      )}
    </span>
  );
}
