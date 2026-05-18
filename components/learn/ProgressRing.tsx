interface ProgressRingProps {
  percent: number;
  size?: number;
}

/** Small circular percentage ring — a clean concentric SVG ring. */
export function ProgressRing({ percent, size = 48 }: ProgressRingProps) {
  const stroke = 4;
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
          stroke="var(--color-surface-input)"
          strokeWidth={stroke}
        />
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="var(--color-primary)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform={`rotate(-90 ${center} ${center})`}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-bold text-ink-secondary">
        {clamped}%
      </span>
    </div>
  );
}
