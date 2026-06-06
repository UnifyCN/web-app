import { Compass, Users, Zap } from "lucide-react";
import { StepHeading } from "../StepHeading";

const OUTCOMES = [
  {
    Icon: Compass,
    title: "Navigate with confidence",
    body: "Build the essentials to feel at home in Canada.",
  },
  {
    Icon: Zap,
    title: "Get fast, trusted answers",
    body: "Reliable guidance when you need it.",
  },
  {
    Icon: Users,
    title: "Build your community",
    body: "Connect with people on similar journeys.",
  },
] as const;

/** Static value preview — mirrors mobile step 10. Collects no data. */
export function OutcomeStep() {
  return (
    <div>
      <StepHeading
        title="Here's what you can achieve in 3 months"
        subtitle="With the answers you just gave, here's what Unify helps you do."
      />
      <div className="mt-5 space-y-3">
        {OUTCOMES.map(({ Icon, title, body }) => (
          <div
            key={title}
            className="flex items-start gap-3 rounded-card border border-border-card bg-surface-card p-4 shadow-sm"
          >
            <span
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg text-primary"
              aria-hidden
            >
              <Icon className="h-5 w-5" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink-secondary">{title}</p>
              <p className="mt-0.5 text-xs text-ink-muted">{body}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
