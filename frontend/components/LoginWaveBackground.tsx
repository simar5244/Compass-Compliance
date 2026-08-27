export function LoginWaveBackground() {
  return (
    <svg
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 h-full w-full"
      viewBox="0 0 1920 900"
      preserveAspectRatio="xMidYMid slice"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <defs>
        <linearGradient id="wave-main" x1="0" y1="0" x2="1920" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4C1D95" />
          <stop offset="45%" stopColor="#5B21B6" />
          <stop offset="100%" stopColor="#C026D3" />
        </linearGradient>
        <linearGradient id="wave-crest" x1="0" y1="0" x2="1920" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A78BFA" />
          <stop offset="100%" stopColor="#D8B4FE" />
        </linearGradient>
      </defs>

      {/* top-right light violet arch */}
      <path
        d="M860,0 C1050,70 1260,210 1920,180 L1920,320 C1480,340 1180,210 950,110 C915,90 885,45 860,0 Z"
        fill="url(#wave-crest)"
        opacity="0.55"
      />

      {/* main purple-to-magenta band */}
      <path
        d="M0,360 C380,280 680,460 1040,370 C1400,280 1680,350 1920,240 L1920,440 C1680,550 1400,480 1040,570 C680,660 380,480 0,560 Z"
        fill="url(#wave-main)"
      />

      {/* light violet crest along the top edge of the main band */}
      <path
        d="M0,360 C380,280 680,460 1040,370 C1400,280 1680,350 1920,240 L1920,270 C1680,380 1400,310 1040,400 C680,490 380,310 0,390 Z"
        fill="url(#wave-crest)"
        opacity="0.8"
      />

      {/* thin sky-blue ribbon near the bottom */}
      <path
        d="M0,560 C300,510 600,610 900,570 C1200,530 1500,600 1920,560 L1920,585 C1500,625 1200,555 900,595 C600,635 300,535 0,585 Z"
        fill="#4FA8F0"
      />
    </svg>
  );
}
