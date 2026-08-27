function ringColor(score: number | null): string {
  if (score === null) return "#9ca3af";
  if (score >= 90) return "#16a34a";
  if (score >= 70) return "#ca8a04";
  return "#dc2626";
}

export function ScoreRing({
  score,
  size = 64,
  strokeWidth = 3,
}: {
  score: number | null;
  size?: number;
  strokeWidth?: number;
}) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - (score ?? 0) / 100);
  const color = ringColor(score);
  const fontSize = size / 3.4;

  return (
    <div style={{ width: size, height: size }} className="relative inline-flex items-center justify-center flex-none">
      <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          className="stroke-black/10 dark:stroke-white/10"
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          strokeWidth={strokeWidth}
          fill="none"
          stroke={color}
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          style={{ transition: "stroke-dashoffset 0.4s ease" }}
        />
      </svg>
      <span className="absolute font-semibold" style={{ fontSize, color }}>
        {score === null ? "—" : Math.round(score)}
        {score !== null && <span style={{ fontSize: "0.6em" }}>%</span>}
      </span>
    </div>
  );
}
