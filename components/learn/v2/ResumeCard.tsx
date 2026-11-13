"use client";

import Link from "next/link";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import type { ResumeEntry } from "@/lib/learn/v2/home";
import { cn, RTL_FLIP } from "@/lib/utils";
import { CourseTile } from "./CourseTile";

/**
 * "Continue learning" card (Figma 160:1198, mobile `ResumeRow`): the most
 * recently opened unfinished lessons, one at a time, with dots to switch.
 */
export function ResumeCard({ entries }: { entries: ResumeEntry[] }) {
  const { t } = useTranslation();
  const [index, setIndex] = useState(0);
  const entry = entries[Math.min(index, entries.length - 1)];
  if (!entry) return null;

  return (
    <section
      aria-label={t("learn.home.continue")}
      className="flex w-full flex-col gap-3 rounded-lg border border-border-card bg-surface px-4 py-3"
    >
      <p className="truncate text-xs font-semibold uppercase text-ink-muted">
        {entry.courseTitle}
      </p>
      <div className="flex items-center gap-3">
        <CourseTile
          course={{ _id: entry.courseId, icon: entry.courseIcon }}
          size="md"
        />
        <div className="min-w-0 flex-1">
          <p className="text-lg font-bold leading-6 text-ink-secondary sm:text-xl">
            {entry.lessonTitle}
          </p>
          <p className="mt-1 text-xs text-ink-muted">
            {t("learn.structured.moduleNumber", { number: entry.moduleNumber })}
            {" · "}
            {t("learn.structured.lessonNumber", { number: entry.lessonNumber })}
          </p>
        </div>
      </div>
      <div className="flex items-end justify-between gap-3">
        {entries.length > 1 ? (
          <div
            className="flex items-center gap-1"
            role="group"
            aria-label={t("learn.home.moreLessons")}
          >
            {entries.map((e, i) => (
              <button
                key={e.lessonId}
                type="button"
                onClick={() => setIndex(i)}
                aria-label={e.lessonTitle}
                aria-current={i === index || undefined}
                className="flex h-6 items-center"
              >
                <span
                  className={cn(
                    "block h-1 w-7 rounded-full transition-colors",
                    i === index ? "bg-primary" : "bg-border",
                  )}
                />
              </button>
            ))}
          </div>
        ) : (
          <span />
        )}
        <Link
          href={entry.href}
          className="press inline-flex min-h-11 items-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark"
        >
          {t("learnWeb.section.resume")}
          <ChevronRight className={cn("size-4", RTL_FLIP)} aria-hidden />
        </Link>
      </div>
    </section>
  );
}
