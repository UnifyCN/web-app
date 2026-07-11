"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Quote } from "lucide-react";
import type { LessonHighlight } from "@/lib/mock/users";

/** A saved text highlight from a Learn lesson; links back to the lesson when
 * the deep-link ids are known. */
export function HighlightCard({ highlight }: { highlight: LessonHighlight }) {
  const { t } = useTranslation();
  const href =
    highlight.moduleId && highlight.submoduleId && highlight.lessonId
      ? `/learn/${highlight.moduleId}/${highlight.submoduleId}/${highlight.lessonId}`
      : null;

  const body = (
    <>
      <Quote className="h-4 w-4 text-primary" aria-hidden />
      <p className="mt-1.5 text-sm leading-relaxed text-ink-secondary">
        {highlight.text}
      </p>
      <p className="mt-2 text-xs text-ink-placeholder">
        {t("profile.highlightFrom", {
          lesson: highlight.lessonTitle,
          module: highlight.moduleTitle,
        })}
      </p>
    </>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="block rounded-card border border-border-card bg-surface p-4 transition-colors hover:bg-surface-card"
      >
        {body}
      </Link>
    );
  }

  return (
    <div className="rounded-card border border-border-card bg-surface p-4">
      {body}
    </div>
  );
}
