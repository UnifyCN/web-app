import { UnifyLogo } from "@/components/UnifyLogo";

/** Intro step — no data collected. */
export function WelcomeStep() {
  return (
    <div className="flex flex-col items-center py-6 text-center">
      <UnifyLogo variant="mark" size={56} />
      <h1 className="mt-6 text-xl font-semibold text-ink-secondary">
        Let&apos;s set up Unify for you
      </h1>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">
        A few quick questions tailor your checklist, learning, and community to
        where you are in your journey to Canada. It takes about a minute.
      </p>
    </div>
  );
}
