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
import { useLessonQuiz, useLessonQuizProgress } from "@/hooks/useLearn";
import { LessonQuiz } from "@/components/learn/practice/LessonQuiz";
import { cn, RTL_FLIP } from "@/lib/utils";
import { trackLessonCompleted, trackLessonPageViewed } from "@/lib/analytics";
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
  const [completeError, setCompleteError] = useState(false);
  const [completing, setCompleting] = useState(false);

  const lesson = lessonQuery.data;
  const steps = useMemo(() => lesson?.pages ?? [], [lesson]);
  const stepCount = steps.length;
  // On the Quick Check (`?quiz=`) the reader sits after the last block.
  const urlQuiz = searchParams.has("quiz");
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
  const stepNumber = urlQuiz
    ? Math.max(stepCount, 1)
    : Number.isFinite(requested)
      ? Math.min(Math.max(requested, 1), Math.max(stepCount, 1))
      : 1;
  const step = steps[stepNumber - 1];
  const isLast = stepNumber === stepCount;

  // Quick Check quiz documents play after the blocks (mobile), at `?quiz=`.
  const quizQuery = useLessonQuiz(lessonId);
  const quizQuestions = (quizQuery.data ?? []).flatMap(
    (q) => q.questions ?? [],
  );
  const firstQuizId = quizQuery.data?.[0]?._id;
  const hasQuiz = quizQuestions.length > 0 && !!firstQuizId;
  const onQuiz = hasQuiz && urlQuiz;
  // Until the quiz query answers, the last step can't know whether a Quick
  // Check follows, so Next waits instead of completing the lesson early.
  // A failed lookup is not "no quiz": it would complete the lesson without
  // its Quick Check, so it counts as unknown and offers a retry.
  const quizFailed = quizQuery.isError && !quizQuery.data;
  const quizUnknown = quizQuery.isPending || quizFailed;
  const quizProgress = useLessonQuizProgress(lessonId, hasQuiz);
  // The quiz opens at the question the link names (`q`): it comes from the
  // lesson's resume position, which either app saves as each question opens,
  // so it is the latest place, also after going back. Saved web answers are
  // kept; only the starting question follows the link.
  const urlQuestion = Number.parseInt(searchParams.get("q") ?? "", 10);
  const linkedIndex =
    Number.isFinite(urlQuestion) && urlQuestion >= 1
      ? Math.min(urlQuestion, Math.max(quizQuestions.length, 1)) - 1
      : undefined;
  const savedQuiz = quizProgress.data ?? null;
  const quizStart =
    linkedIndex === undefined
      ? savedQuiz
      : {
          lessonId,
          answers: savedQuiz?.answers ?? {},
          currentQuestionIndex: linkedIndex,
          currentSubmitted:
            !!savedQuiz &&
            savedQuiz.currentQuestionIndex === linkedIndex &&
            savedQuiz.currentSubmitted,
          isCompleted: savedQuiz?.isCompleted ?? false,
          score: savedQuiz?.score ?? null,
          totalQuestions: quizQuestions.length,
          updatedAt: savedQuiz?.updatedAt ?? "",
        };

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

  // Opening a step saves where the user is (position only). Not on the quiz:
  // its position is saved when it opens, and a step save would overwrite it.
  const { mutate: saveResumeMutate } = saveResume;
  // Writes wait until the course confirms this lesson belongs to this module,
  // so a mismatched URL can't store the wrong parent ids on the user's row.
  const inModule = !!stub;
  useEffect(() => {
    if (!step || !inModule || urlQuiz) return;
    saveResumeMutate({ ...ids, pageType: "lesson", pageNumber: stepNumber });
    trackLessonPageViewed({
      ...ids,
      pageNumber: stepNumber,
      totalPages: stepCount,
    });
    window.scrollTo({ top: 0 });
  }, [step, stepNumber, stepCount, inModule, urlQuiz, ids, saveResumeMutate]);

  const sections = useMemo(() => (step ? stepSections(step) : []), [step]);

  // Awaitable, so the Quick Check stays open (with its retry) until the
  // lesson is saved as complete. Guarded like next(): nothing is written for
  // a lesson outside the URL's module.
  const finish = async () => {
    if (!inModule) return;
    await complete.mutateAsync({ ...ids, totalPages });
    trackLessonCompleted(ids);
  };

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

  async function next() {
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
    if (hasQuiz) {
      // As mobile: no page save for the last step here, and the quiz position
      // is saved per question as it opens (page = question number).
      router.push(`?quiz=${encodeURIComponent(firstQuizId!)}&q=1`, {
        scroll: false,
      });
      return;
    }
    // Leave only once the lesson is saved as complete (mobile waits too).
    // Next and Back stay disabled meanwhile, so it can't repeat or race.
    if (completing) return;
    setCompleteError(false);
    setCompleting(true);
    try {
      await finish();
    } catch {
      setCompleteError(true);
      return;
    } finally {
      setCompleting(false);
    }
    router.push(
      nextLesson
        ? `/learn/${courseId}/${moduleId}/${nextLesson._id}`
        : moduleHref,
    );
  }

  function back() {
    if (completing) return;
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
            {stepCount > 0 && !onQuiz && `${stepNumber} / ${stepCount}`}
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
            {!onQuiz &&
              !step.activity &&
              step.title &&
              step.title !== lesson.title && (
                <p className="text-base font-semibold text-ink-tertiary">
                  {step.title}
                </p>
              )}
          </header>

          {onQuiz ? (
            quizProgress.isPending ? (
              <p className="loading-delayed text-sm text-ink-muted">
                {t("common.loading")}
              </p>
            ) : quizProgress.isError && !quizProgress.data ? (
              // Unknown saved answers would restart the quiz at question 1.
              <RetryLine onRetry={() => quizProgress.refetch()} />
            ) : (
              <LessonQuiz
                lessonId={lessonId}
                moduleId={courseId}
                submoduleId={moduleId}
                title={
                  quizQuery.data?.[0]?.title ?? t("learn.structured.quickCheck")
                }
                questions={quizQuestions}
                colorHex="#f68b26"
                onLessonComplete={finish}
                sectionHref={moduleHref}
                initialProgress={quizStart}
                saveReady={inModule}
                onQuestionChange={(index) =>
                  inModule &&
                  saveResumeMutate({
                    ...ids,
                    pageType: "quiz",
                    pageNumber: index + 1,
                    quiz: { quizId: firstQuizId!, questionNumber: index + 1 },
                  })
                }
              />
            )
          ) : step.activity ? (
            <ActivityStepV2
              key={step._key}
              step={step}
              onReady={onActivityReady}
              ids={ids}
            />
          ) : (
            <LessonSectionsV2
              key={step._key}
              sections={sections}
              renderRich={renderRich}
            />
          )}

          {!onQuiz && (
            <nav
              className="mt-4 grid grid-cols-2 gap-3"
              aria-label={lesson.title}
            >
              {completeError && (
                <div className="col-span-2">
                  <RetryLine onRetry={() => void next()} />
                </div>
              )}
              {isLast && quizFailed && (
                <div className="col-span-2">
                  <RetryLine onRetry={() => quizQuery.refetch()} />
                </div>
              )}
              <button
                type="button"
                onClick={back}
                disabled={completing}
                className="press min-h-11 rounded-lg border border-border-card bg-surface px-4 text-sm font-semibold text-ink-secondary hover:bg-surface-card"
              >
                {t("common.back")}
              </button>
              <button
                type="button"
                onClick={() => void next()}
                disabled={
                  completing || !activityReady || (isLast && quizUnknown)
                }
                className={cn(
                  "press inline-flex min-h-11 items-center justify-center gap-1 rounded-lg bg-primary px-4 text-sm font-semibold text-white hover:bg-primary-dark",
                  "disabled:cursor-not-allowed disabled:bg-primary-disabled",
                )}
              >
                {isLast && !hasQuiz
                  ? nextLesson
                    ? t("learn.structured.nextLesson")
                    : t("common.done")
                  : t("common.next")}
                <ChevronRight className={cn("size-4", RTL_FLIP)} aria-hidden />
              </button>
            </nav>
          )}
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

function RetryLine({ onRetry }: { onRetry: () => void }) {
  const { t } = useTranslation();
  return (
    <div
      role="alert"
      className="flex items-center justify-between gap-3 rounded-lg border border-border-card bg-surface-card px-4 py-3 text-sm text-ink-muted"
    >
      <span>{t("common.errorGeneric")}</span>
      <button
        type="button"
        onClick={onRetry}
        className="press min-h-11 shrink-0 px-2 font-semibold text-primary"
      >
        {t("common.retry")}
      </button>
    </div>
  );
}
