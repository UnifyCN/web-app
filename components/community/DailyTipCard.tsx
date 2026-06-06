"use client";

import { Lightbulb } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { useDailyTip } from "@/hooks/useDailyTip";

/**
 * Personalized daily tip, shown at the top of the Community → "News & Tips"
 * tab. Fails quietly (renders nothing) on error — the tip is a nice-to-have.
 */
export function DailyTipCard() {
  const { data: tip, isLoading, error } = useDailyTip();

  if (isLoading) {
    return (
      <div className="rounded-card border border-border-card bg-primary-bg p-4">
        <p className="text-sm text-ink-muted">Loading today&apos;s tip…</p>
      </div>
    );
  }

  if (error || !tip) return null;

  return (
    <section
      aria-label="Daily tip"
      className="rounded-card border border-border-card bg-primary-bg p-4"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-primary-subtle text-primary">
          <Lightbulb className="h-4 w-4" aria-hidden />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-primary">
          Daily tip
        </span>
        {tip.category && <Badge variant="neutral">{tip.category}</Badge>}
      </div>
      <h3 className="mt-2 text-sm font-bold text-ink-secondary">{tip.title}</h3>
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        {tip.tipText}
      </p>
      {tip.sources && tip.sources.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {tip.sources.map((s) => (
            <a
              key={s.url}
              href={s.url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs font-medium text-primary underline-offset-2 hover:underline"
            >
              {s.documentTitle}
            </a>
          ))}
        </div>
      )}
    </section>
  );
}
