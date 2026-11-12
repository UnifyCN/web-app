"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { useModules } from "@/hooks/useLearn";
import { useLessonProgressRows } from "@/hooks/useLearnV2";
import { courseSummaries, resumeEntries } from "@/lib/learn/v2/home";
import { cn } from "@/lib/utils";
import { CourseTile } from "./CourseTile";
import { ResumeCard } from "./ResumeCard";

type Filter = "all" | "started";

/**
 * Learn home, v2 (Figma 160:1198; behaviour from mobile `Learn/index.tsx`):
 * heading, "Continue learning" card, and the Courses list with All / Started.
 * No home FAQ (dropped for launch, matching mobile). Courses come from
 * `useModules`, which already applies province targeting.
 */
export function LearnHomeV2() {
  const { t, i18n } = useTranslation();
  const percentFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: "percent" }),
    [i18n.language],
  );
  const [filter, setFilter] = useState<Filter>("all");
  const modules = useModules();
  const progress = useLessonProgressRows();
  const rows = useMemo(() => progress.data ?? [], [progress.data]);

  const summaries = useMemo(
    () => courseSummaries(modules.data ?? [], rows),
    [modules.data, rows],
  );
  const resume = useMemo(
    () => resumeEntries(modules.data ?? [], rows),
    [modules.data, rows],
  );
  const visible = summaries.filter((s) => filter === "all" || s.started);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-8 px-4 py-6 md:px-6 md:py-12">
      <header className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold tracking-tight text-ink-secondary md:text-[32px] md:leading-tight">
          {t("learn.home.heading")}
        </h1>
        <p className="text-sm text-ink-muted">{t("learn.home.subtitle")}</p>
      </header>

      {resume.length > 0 && <ResumeCard entries={resume} />}

      <section
        className="flex flex-col gap-3"
        aria-labelledby="courses-heading"
      >
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <h2
              id="courses-heading"
              className="text-base font-semibold text-ink-secondary"
            >
              {t("learn.home.courses")}
            </h2>
            <div
              className="flex gap-4"
              role="group"
              aria-label={t("learn.home.courses")}
            >
              {(["all", "started"] as const).map((value) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setFilter(value)}
                  aria-pressed={filter === value}
                  className={cn(
                    "press-dim min-h-8 text-xs",
                    filter === value
                      ? "font-semibold text-ink"
                      : "text-ink-muted hover:text-ink",
                  )}
                >
                  {t(`learn.home.${value}`)}
                </button>
              ))}
            </div>
          </div>
          <hr className="border-border-card" />
        </div>

        {modules.isPending ? (
          <CourseListSkeleton />
        ) : modules.isError ? (
          <p className="text-sm text-ink-muted">
            {t("learn.errorLoadingModules")}
          </p>
        ) : visible.length === 0 ? (
          <p className="py-6 text-sm text-ink-muted">
            {filter === "started"
              ? t("learn.home.emptyStarted")
              : t("learn.noModulesAvailable")}
          </p>
        ) : (
          <ul className="flex flex-col">
            {visible.map(({ course, moduleCount, lessonCount, percent }) => (
              <li key={course._id} className="border-b border-border-card">
                <Link
                  href={`/learn/${course._id}`}
                  className="press-dim flex items-center gap-4 py-3"
                >
                  <CourseTile course={course} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-base font-semibold leading-5 text-ink-secondary">
                      {course.title}
                    </span>
                    <span className="mt-1 block text-xs text-ink-muted">
                      {t("learn.home.moduleCount", { count: moduleCount })}
                      {" · "}
                      {t("learn.home.lessonCount", { count: lessonCount })}
                    </span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-ink-secondary tabular-nums">
                    {percentFormat.format(percent / 100)}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function CourseListSkeleton() {
  return (
    <ul aria-hidden className="flex flex-col">
      {Array.from({ length: 4 }, (_, i) => (
        <li
          key={i}
          className="flex items-center gap-4 border-b border-border-card py-3"
        >
          <span className="size-11 animate-pulse rounded-xl bg-surface-gray" />
          <span className="flex-1 space-y-2">
            <span className="block h-4 w-1/3 animate-pulse rounded bg-surface-gray" />
            <span className="block h-3 w-1/4 animate-pulse rounded bg-surface-gray" />
          </span>
        </li>
      ))}
    </ul>
  );
}
