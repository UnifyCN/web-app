"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Check, ChevronRight, ListChecks } from "lucide-react";
import { useCourseV2, useLessonProgressRows } from "@/hooks/useLearnV2";
import { lessonStates, type LessonState } from "@/lib/learn/v2/course";
import { completionPercent, lessonResumeHref } from "@/lib/learn/v2/progress";
import { cn, RTL_FLIP } from "@/lib/utils";
import { BackLink, ProgressBar } from "./BackLink";

/**
 * Module page, v2 (Figma 160:1021; mobile `modules/[moduleId]/[submoduleId]`):
 * lesson count and reading time, title, description, progress, the lessons
 * (done / up next with Start / to do), and the module's Practice when it has
 * one. Lessons open in any order.
 */
export function ModulePageV2({
  courseId,
  moduleId,
}: {
  courseId: string;
  moduleId: string;
}) {
  const { t } = useTranslation();
  const courseQuery = useCourseV2(courseId);
  const progress = useLessonProgressRows();
  const rows = useMemo(() => progress.data ?? [], [progress.data]);
  const course = courseQuery.data;
  const mod = course?.submodules.find((s) => s._id === moduleId);

  const completed = useMemo(
    () =>
      new Set(
        rows.filter((r) => r.is_completed).map((r) => r.sanity_lesson_id),
      ),
    [rows],
  );
  const lessons = mod?.lessons ?? [];
  const ids = lessons.map((l) => l._id);
  const states = lessonStates(ids, completed);
  const minutes = lessons.reduce((sum, l) => sum + l.readingMinutes, 0);
  const percent = completionPercent(ids, completed);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-4 py-4 md:px-6 md:py-10">
      <BackLink
        href={`/learn/${courseId}`}
        label={course?.title ?? t("learn.home.courses")}
      />

      {courseQuery.isPending ? (
        <div aria-hidden className="flex flex-col gap-4">
          <span className="h-3 w-24 animate-pulse rounded bg-surface-gray" />
          <span className="h-8 w-1/2 animate-pulse rounded bg-surface-gray" />
          <span className="h-40 animate-pulse rounded-xl bg-surface-gray" />
        </div>
      ) : !mod ? (
        <p className="text-sm text-ink-muted">
          {t("learn.errorLoadingLessons")}
        </p>
      ) : (
        <>
          <header className="flex flex-col gap-3">
            <p className="text-xs font-medium text-ink-muted">
              {t("learn.home.lessonCount", { count: lessons.length })}
              {" · "}
              {t("learn.structured.readingMinutes", { count: minutes })}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-ink-secondary md:text-[32px] md:leading-tight">
              {mod.title}
            </h1>
            {mod.description && (
              <p className="text-sm text-ink-muted">{mod.description}</p>
            )}
            <ProgressBar
              percent={percent}
              label={t("learn.home.completionSummary", {
                completed: ids.filter((id) => completed.has(id)).length,
                total: ids.length,
              })}
              className="mt-1"
            />
          </header>

          <section
            className="flex flex-col gap-3"
            aria-labelledby="lessons-heading"
          >
            <h2
              id="lessons-heading"
              className="text-xl font-semibold text-ink-secondary"
            >
              {t("learnWeb.home.lessonsHeading")}
            </h2>
            <ol className="overflow-hidden rounded-xl border border-border-card bg-surface">
              {lessons.map((lesson, i) => {
                const state = states[i];
                const row = rows.find((r) => r.sanity_lesson_id === lesson._id);
                // A saved `intro` position belongs to this page, so it opens the
                // lesson's first step instead of linking here again.
                const href =
                  state === "done" || row?.current_page_type === "intro"
                    ? `/learn/${courseId}/${moduleId}/${lesson._id}`
                    : lessonResumeHref(
                        {
                          lessonId: lesson._id,
                          submoduleId: moduleId,
                          moduleId: courseId,
                        },
                        row,
                      );
                return (
                  <li
                    key={lesson._id}
                    className="border-b border-border-card last:border-b-0"
                  >
                    <Link
                      href={href}
                      className="press-dim flex min-h-16 items-center gap-4 px-4 py-3 hover:bg-surface-card"
                    >
                      <StateMark state={state} />
                      <span className="min-w-0 flex-1">
                        <span
                          className={cn(
                            "block text-base font-semibold leading-5",
                            state === "todo"
                              ? "text-ink-tertiary"
                              : "text-ink-secondary",
                          )}
                        >
                          {lesson.title}
                        </span>
                        <span className="mt-1 block text-xs text-ink-muted">
                          {state === "done" && `${t("common.done")} · `}
                          {state === "next" && `${t("learn.home.upNext")} · `}
                          {t("learn.structured.readingMinutes", {
                            count: lesson.readingMinutes,
                          })}
                        </span>
                      </span>
                      {state === "next" ? (
                        <span className="inline-flex min-h-9 shrink-0 items-center rounded-lg bg-primary px-4 text-sm font-semibold text-white">
                          {t("common.start")}
                        </span>
                      ) : (
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 text-ink-placeholder",
                            RTL_FLIP,
                          )}
                          aria-hidden
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>

          {(mod.practice_count ?? 0) > 0 && (
            <Link
              href={`/learn/${courseId}/${moduleId}/practice`}
              className="press flex items-center gap-4 rounded-xl border border-border-card bg-surface px-4 py-3 hover:bg-surface-card"
            >
              <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary">
                <ListChecks className="size-5" aria-hidden />
              </span>
              <span className="flex-1 text-base font-semibold text-ink-secondary">
                {t("learn.submodule.practiceTitle")}
              </span>
              <ChevronRight
                className={cn("size-4 text-ink-placeholder", RTL_FLIP)}
                aria-hidden
              />
            </Link>
          )}
        </>
      )}
    </div>
  );
}

function StateMark({ state }: { state: LessonState }) {
  if (state === "done") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-white">
        <Check className="size-4" strokeWidth={3} aria-hidden />
      </span>
    );
  }
  if (state === "next") {
    return (
      <span className="flex size-7 shrink-0 items-center justify-center rounded-full border-2 border-primary">
        <span className="size-3 rounded-full bg-primary" />
      </span>
    );
  }
  return (
    <span className="size-7 shrink-0 rounded-full border-2 border-border-card" />
  );
}
