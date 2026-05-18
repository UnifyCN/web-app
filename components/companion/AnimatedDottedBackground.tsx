/**
 * Decorative animated dashed lines behind the Companion empty state.
 * The dashes flow along each path via the `companion-dash` keyframe;
 * the global reduced-motion rule freezes it.
 */
export function AnimatedDottedBackground() {
  return (
    <div
      aria-hidden
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <svg
        className="h-full w-full"
        viewBox="0 0 600 600"
        fill="none"
        preserveAspectRatio="xMidYMid slice"
      >
        {[
          "M-40 110 C 160 -20 300 250 470 90 C 610 -30 690 330 880 170",
          "M-60 470 C 130 330 270 560 470 380 C 650 230 770 520 950 360",
          "M150 -50 C 250 170 80 370 300 470 C 500 560 440 760 660 700",
        ].map((d) => (
          <path
            key={d}
            d={d}
            stroke="var(--color-mention-blue)"
            strokeOpacity={0.3}
            strokeWidth={4}
            strokeLinecap="round"
            strokeDasharray="12 18"
            className="animate-companion-dash"
          />
        ))}
      </svg>
    </div>
  );
}
