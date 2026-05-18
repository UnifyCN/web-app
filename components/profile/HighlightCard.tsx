import { Quote } from "lucide-react";
import type { LessonHighlight } from "@/lib/mock/users";

/** A saved text highlight from a Learn lesson. */
export function HighlightCard({ highlight }: { highlight: LessonHighlight }) {
  return (
    <div className="rounded-card border border-border-card bg-surface p-4">
      <Quote className="h-4 w-4 text-primary" aria-hidden />
      <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
        {highlight.text}
      </p>
      <p className="mt-2 text-xs text-ink-placeholder">
        From {highlight.lessonTitle} · {highlight.moduleTitle}
      </p>
    </div>
  );
}
