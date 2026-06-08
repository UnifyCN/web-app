import type { ReactNode } from "react";

interface ProgressRingProps {
  percent: number;
  size?: number;
  /** Ring thickness in px. */
  stroke?: number;
  /** Show the centered "NN%" label (default true). */
  showLabel?: boolean;
  /** Track (unfilled) colour. Defaults to the input-surface grey. */
  trackColor?: string;
  /** Progress (filled) colour. Defaults to the brand primary. */
  progressColor?: string;
  /** Optional center content (e.g. a check icon); overrides the % label. */
  children?: ReactNode;
}

/** Small circular percentage ring — a clean concentric SVG ring. */
export function ProgressRing({
  percent,
  size = 48,
  stroke = 4,
  showLabel = true,
  trackColor = "var(--color-surface-input)",
  progressColor = "var(--color-primary)",
  children,
}: ProgressRingProps) {
  const center = size / 2;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const offset = circumference - (clamped / 100) * circumference;

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={trackColor}
          strokeWidth={stroke}
        />
        {clamped > 0 && (
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={progressColor}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${center} ${center})`}
            style={{ transition: "stroke-dashoffset 300ms ease-out" }}
          />
        )}
      </svg>
      {children ? (
        <span className="absolute inset-0 flex items-center justify-center">
          {children}
        </span>
      ) : (
        showLabel && (
          <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-secondary">
            {clamped}%
          </span>
        )
      )}
    </div>
  );
}
