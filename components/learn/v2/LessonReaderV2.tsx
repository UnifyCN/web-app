"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { ChevronRight, X } from "lucide-react";
import {
  useCompleteLesson,
  useCourseV2,
  useLessonV2,
  useSaveLessonPage,
  useSaveResumePosition,
} from "@/hooks/useLearnV2";
import {
  getOrderedLegacyPageNumber,
  stepSections,
} from "@/lib/learn/v2/contentBlocks";
import { cn, RTL_FLIP } from "@/lib/utils";
import { SelectableLessonContent } from "@/components/learn/SelectableLessonContent";
import { ExplainTermModal } from "@/components/learn/ExplainTermModal";
import type { SanityBlock } from "@/types";
import type { LessonStep } from "@/lib/learn/v2/types";
import { ProgressBar } from "./BackLink";
import { LessonSectionsV2 } from "./LessonSectionsV2";
import { ActivityStepV2 } from "./ActivityStepV2";

export interface ActivityRenderProps {
  step: LessonStep;
  onReady: (ready: boolean) => void;
}

/**
 * Lesson reader, v2 (Figma 160:889; mobile `lessons/[lessonId]/pages/[pageNum]`).
 * One step per content block, in author order, at `?step=N`. Opening a step
 * saves the resume position; Next saves the step as done; the last step
 * completes the lesson (mobile semantics, lib/learn/v2/progress.ts).
 * Highlights and Ask AI run through SelectableLessonContent, keyed by the
 * block `_key` (the same `page_key` mobile uses).
 */
export function LessonReaderV2({
  courseId,
  moduleId,
  lessonId,
}: {
  courseId: string;
  moduleId: string;
  lessonId: string;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const lessonQuery = useLessonV2(lessonId);
  const courseQuery = useCourseV2(courseId);
  const saveResume = useSaveResumePosition();
  const savePage = useSaveLessonPage();
  const complete = useCompleteLesson();
  const [askTerm, setAskTerm] = useState<string | null>(null);
  const [readyKey, setReadyKey] = useState<string | null>(null);

  const lesson = lessonQuery.data;
  const steps = useMemo(() => lesson?.pages ?? [], [lesson]);
  const stepCount = steps.length;
  // An old resume position (`?legacy=activity|ending&page=N`, from lists that
  // don't load blocks) maps to its block's step here, as mobile's legacy
  // routes do (#353); unmatched falls back to step 1.
  const legacyType = searchParams.get("legacy");
  const legacyStep =
    lesson && (legacyType === "activity" || legacyType === "ending")
      ? (getOrderedLegacyPageNumber({
          lesson,
          pageType: legacyType,
          pageNumber: Number.parseInt(searchParams.get("page") ?? "", 10),
        }) ?? 1)
      : undefined;
  const requested =
    legacyStep ?? Number.parseInt(searchParams.get("step") ?? "1", 10);
  const stepNumber = Number.isFinite(requested)
    ? Math.min(Math.max(requested, 1), Math.max(stepCount, 1))
    : 1;
  const step = steps[stepNumber - 1];
  const isLast = stepNumber === stepCount;

  const course = courseQuery.data;
  const modIndex =
    course?.submodules.findIndex((s) => s._id === moduleId) ?? -1;
  const mod = modIndex >= 0 ? course?.submodules[modIndex] : undefined;
  const lessonIndex = mod?.lessons.findIndex((l) => l._id === lessonId) ?? -1;
  const stub = lessonIndex >= 0 ? mod?.lessons[lessonIndex] : undefined;
  const nextLesson =
    lessonIndex >= 0 ? mod?.lessons[lessonIndex + 1] : undefined;
  const moduleHref = `/learn/${courseId}/${moduleId}`;
  const ids = useMemo(
    () => ({ lessonId, submoduleId: moduleId, moduleId: courseId }),
    [lessonId, moduleId, courseId],
  );
  const totalPages = lesson?.totalPages ?? stepCount;

  // Opening a step saves where the user is (position only).
  const { mutate: saveResumeMutate } = saveResume;
  // Writes wait until the course confirms this lesson belongs to this module,
  // so a mismatched URL can't store the wrong parent ids on the user's row.
  const inModule = !!stub;
  useEffect(() => {
    if (!step || !inModule) return;
    saveResumeMutate({ ...ids, pageType: "lesson", pageNumber: stepNumber });
    window.scrollTo({ top: 0 });
  }, [step, stepNumber, inModule, ids, saveResumeMutate]);

  // Activities gate Next until submitted (mobile `activityReady`). Readiness
  // is kept per step key, so a new step starts gated without an effect.
  const stepKey = step?._key;
  const activityReady = !step?.activity || readyKey === stepKey;
  const onActivityReady = useCallback(
    (ready: boolean) => setReadyKey(ready ? (stepKey ?? null) : null),
    [stepKey],
  );

  // Search arrivals keep their term highlighted across steps (as v1 does).
  const highlightQuery = searchParams.get("highlight") ?? undefined;
  const goTo = (n: number) =>
    router.push(
      `?step=${n}${highlightQuery ? `&highlight=${encodeURIComponent(highlightQuery)}` : ""}`,
      { scroll: false },
    );

  function next() {
    if (!step || !inModule) return;
    if (!isLast) {
      savePage.mutate({
        ...ids,
        pageType: "lesson",
        pageNumber: stepNumber,
        totalPages,
      });
      goTo(stepNumber + 1);
      return;
    }
    complete.mutate({ ...ids, totalPages });
    router.push(
      nextLesson
        ? `/learn/${courseId}/${moduleId}/${nextLesson._id}`
        : moduleHref,
    );
  }

  function back() {
    if (stepNumber > 1) goTo(stepNumber - 1);
    else router.push(moduleHref);
  }

  const renderRich = (blocks: SanityBlock[]) =>
    step ? (
      <SelectableLessonContent
        blocks={blocks}
        lessonId={lessonId}
        pageKey={step._key}
        pageNum={stepNumber}
        moduleId={courseId}
        submoduleId={moduleId}
        submoduleTitle={mod?.title ?? ""}
        onAskAI={setAskTerm}
        highlightQuery={highlightQuery}
      />
    ) : null;

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col px-4 pb-28 pt-3 md:px-6 md:pb-16 md:pt-8">
      <div className="sticky top-0 z-10 -mx-4 bg-surface/95 px-4 pb-2 pt-2 backdrop-blur md:-mx-6 md:px-6">
        <div className="flex min-h-11 items-center gap-3">
          <Link
            href={moduleHref}
            aria-label={t("common.close")}
            className="press-dim -ms-2 flex size-11 items-center justify-center rounded-lg text-ink hover:bg-surface-gray"
          >
            <X className="size-5" aria-hidden />
          </Link>
          <p className="min-w-0 flex-1 truncate text-center text-sm font-semibold text-ink-secondary">
            {modIndex >= 0
              ? t("learn.structured.moduleNumber", { number: modIndex + 1 })
              : ""}
          </p>
          <p
            className="w-11 text-end text-xs text-ink-muted tabular-nums"
            aria-live="polite"
            dir="ltr"
          >
            {stepCount > 0 && `${stepNumber} / ${stepCount}`}
          </p>
        </div>
        <ProgressBar
          percent={stepCount ? (stepNumber / stepCount) * 100 : 0}
          label={lesson?.title ?? ""}
          className="h-0.5"
        />
      </div>

      {lessonQuery.isPending ? (
        <div aria-hidden className="mt-8 flex flex-col gap-4">
          <span className="h-3 w-32 animate-pulse rounded bg-surface-gray" />
          <span className="h-8 w-2/3 animate-pulse rounded bg-surface-gray" />
          <span className="h-48 animate-pulse rounded-lg bg-surface-gray" />
        </div>
      ) : !lesson || !step ? (
        <p className="mt-8 text-sm text-ink-muted">
          {t("learn.errorLoadingLessons")}
        </p>
      ) : (
        <article className="mt-6 flex flex-col gap-6">
          <header className="flex flex-col gap-2">
            <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">
              {t("learn.structured.lessonNumber", {
                number: String(lessonIndex >= 0 ? lessonIndex + 1 : 1).padStart(
                  2,
                  "0",
                ),
              })}
              {stub &&
                ` · ${t("learn.structured.readingMinutes", { count: stub.readingMinutes })}`}
            </p>
            <h1 className="text-2xl font-bold tracking-tight text-ink-secondary md:text-[32px] md:leading-tight">
              {lesson.title}
            </h1>
            {!step.activity && step.title && step.title !== lesson.title && (
              <p className="text-base font-semibold text-ink-tertiary">
                {step.title}
              </p>
            )}
          </header>

          {step.activity ? (
            <ActivityStepV2
              key={step._key}
              step={step}
              onReady={onActivityReady}
              ids={ids}
            />
          ) : (
            <LessonSectionsV2
              key={step._key}
              sections={stepSections(step)}
              renderRich={renderRich}
            />
          )}

          <nav
            className="mt-4 grid grid-cols-2 gap-3"
            aria-label={t("learnWeb.pager.nextUp")}
          >
            <button
              type="button"
              onClick={back}
              className="press min-h-11 rounded-lg border border-border-card bg-surface px-4 text-sm font-semibold text-ink-secondary hover:bg-surface-card"
            >
              {t("common.back")}
            </button>
            <button
              type="button"
              onClick={next}
              disabled={!activityReady}
              className={cn(
                "press inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark",
                "disabled:cursor-not-allowed disabled:bg-primary-disabled",
              )}
            >
              {isLast
                ? nextLesson
                  ? t("learn.structured.nextLesson")
                  : t("common.done")
                : t("common.next")}
              <ChevronRight className={cn("size-4", RTL_FLIP)} aria-hidden />
            </button>
          </nav>
        </article>
      )}

      <ExplainTermModal
        term={askTerm}
        lessonContext={lesson?.title}
        onClose={() => setAskTerm(null)}
      />
    </div>
  );
}
