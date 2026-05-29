/** Shared question heading for onboarding steps. */
export function StepHeading({
  title,
  subtitle,
}: {
  title: string;
  subtitle?: string;
}) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-secondary">{title}</h1>
      {subtitle && <p className="mt-1.5 text-sm text-ink-muted">{subtitle}</p>}
    </div>
  );
}
