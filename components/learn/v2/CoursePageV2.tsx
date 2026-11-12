"use client";

import Link from "next/link";
import { useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react";
import { useCourseV2, useLessonProgressRows } from "@/hooks/useLearnV2";
import { progressSets } from "@/lib/learn/v2/course";
import { completionPercent } from "@/lib/learn/v2/progress";
import { cn, RTL_FLIP } from "@/lib/utils";
import { trackModuleViewed } from "@/lib/analytics";
import { BackLink, ProgressBar } from "./BackLink";
import { CourseTile } from "./CourseTile";

/**
 * Course page, v2 (Figma 160:1109; mobile `modules/[moduleId]`): icon and
 * title, description, and the course's modules (Sanity submodules) as cards
 * with "N lessons · M done" and a progress bar. Province access is enforced
 * by the `[moduleId]` layout.
 */
export function CoursePageV2({ courseId }: { courseId: string }) {
  const { t, i18n } = useTranslation();
  const courseQuery = useCourseV2(courseId);
  const progress = useLessonProgressRows();
  const { completed } = useMemo(
    () => progressSets(progress.data ?? []),
    [progress.data],
  );
  const percentFormat = useMemo(
    () => new Intl.NumberFormat(i18n.language, { style: "percent" }),
    [i18n.language],
  );
  const course = courseQuery.data;

  // Same `module_viewed` event as the v1 page, once per course load.
  useEffect(() => {
    if (!course) return;
    trackModuleViewed({
      moduleId: course._id,
      moduleTitle: course.title,
      submoduleCount: course.submodules.length,
    });
  }, [course]);

  return (
    <div className="mx-auto flex w-full max-w-[820px] flex-col gap-6 px-4 py-4 md:px-6 md:py-10">
      <BackLink href="/learn" label={t("learn.home.tabLabel")} />

      {courseQuery.isPending ? (
        <HeaderSkeleton />
      ) : !course ? (
        <p className="text-sm text-ink-muted">
          {t("learn.errorLoadingModules")}
        </p>
      ) : (
        <>
          <header className="flex flex-col gap-4">
            <div className="flex items-center gap-4">
              <CourseTile course={course} size="md" />
              <h1 className="text-2xl font-bold tracking-tight text-ink-secondary md:text-[32px] md:leading-tight">
                {course.title}
              </h1>
            </div>
            {course.description && (
              <p className="text-sm text-ink-muted">{course.description}</p>
            )}
          </header>

          <section
            className="flex flex-col gap-4"
            aria-labelledby="modules-heading"
          >
            <h2
              id="modules-heading"
              className="text-xl font-semibold text-ink-secondary"
            >
              {t("learn.home.modules")}
            </h2>
            <ol className="flex flex-col gap-4">
              {course.submodules.map((mod, index) => {
                const ids = mod.lessons.map((l) => l._id);
                const done = ids.filter((id) => completed.has(id)).length;
                const percent = completionPercent(ids, completed);
                const started = done > 0;
                return (
                  <li key={mod._id}>
                    <Link
                      href={`/learn/${course._id}/${mod._id}`}
                      className="press flex flex-col gap-3 rounded-xl border border-border-card bg-surface p-4 hover:bg-surface-card"
                    >
                      <span className="flex items-center gap-3">
                        <span
                          aria-hidden
                          className={cn(
                            "flex size-9 shrink-0 items-center justify-center rounded-lg text-sm font-semibold text-white",
                            started ? "bg-primary" : "bg-ink-placeholder",
                          )}
                        >
                          {index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span
                            className={cn(
                              "block text-base font-semibold leading-5",
                              started
                                ? "text-ink-secondary"
                                : "text-ink-tertiary",
                            )}
                          >
                            {mod.title}
                          </span>
                          <span className="mt-0.5 block text-xs text-ink-muted">
                            {t("learn.home.lessonSummary", {
                              count: ids.length,
                              done,
                            })}
                          </span>
                        </span>
                        <ChevronRight
                          className={cn(
                            "size-4 shrink-0 text-ink-placeholder",
                            RTL_FLIP,
                          )}
                          aria-hidden
                        />
                      </span>
                      <span className="flex items-center gap-3">
                        <ProgressBar percent={percent} label={mod.title} />
                        <span className="w-10 shrink-0 text-end text-xs text-ink-muted tabular-nums">
                          {percentFormat.format(percent / 100)}
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div aria-hidden className="flex flex-col gap-4">
      <div className="flex items-center gap-4">
        <span className="size-14 animate-pulse rounded-xl bg-surface-gray" />
        <span className="h-8 w-1/2 animate-pulse rounded bg-surface-gray" />
      </div>
      <span className="h-4 w-3/4 animate-pulse rounded bg-surface-gray" />
      {Array.from({ length: 3 }, (_, i) => (
        <span
          key={i}
          className="h-24 animate-pulse rounded-xl bg-surface-gray"
        />
      ))}
    </div>
  );
}
