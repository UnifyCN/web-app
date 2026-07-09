"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { useUpsertLessonQuizProgress } from "@/hooks/useLearn";
import { cn } from "@/lib/utils";
import { trackQuizCompleted } from "@/lib/analytics";
import type { LessonQuizProgress, SanityQuizQuestion } from "@/types";
import { QuizQuestion } from "./QuizQuestion";
import { computeScore, isAnswered } from "./grade";

interface LessonQuizProps {
  lessonId: string;
  moduleId: string;
  submoduleId: string;
  title: string;
  questions: SanityQuizQuestion[];
  colorHex: string;
  /** Marks the lesson complete — fired when the quiz is finished (Done). */
  onLessonComplete: () => void;
  /** The submodule page — finishing navigates here (never the next lesson). */
  sectionHref: string;
  /** Saved progress so answers survive unmount (exit/re-enter, or paging the
   *  quiz screen off and back). Seeded into state on mount. */
  initialProgress: LessonQuizProgress | null;
}

/**
 * Inline "Quick Check" rendered mid-lesson. Reuses the shared QuizQuestion
 * renderers + grade.ts. Persists answers + position via useUpsertLessonQuizProgress
 * on every submit/next and re-seeds them from `initialProgress` on mount, so the
 * user's selections survive unmount (exit/re-enter, or toggling the quiz screen).
 * On finishing it records completion and navigates back to the section (no results
 * screen). Back navigates to the previous question, preserving its answer + state.
 * Mirrors the PracticeQuiz resume pattern.
 */
export function LessonQuiz({
  lessonId,
  moduleId,
  submoduleId,
  title,
  questions,
  colorHex,
  onLessonComplete,
  sectionHref,
  initialProgress,
}: LessonQuizProps) {
  const router = useRouter();
  const upsert = useUpsertLessonQuizProgress();
  const total = questions.length;

  const initialIndex = Math.min(
    initialProgress?.currentQuestionIndex ?? 0,
    Math.max(0, total - 1),
  );
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  const [answers, setAnswers] = useState<Record<string, string[]>>(
    initialProgress?.answers ?? {},
  );
  const [submitted, setSubmitted] = useState<Record<string, boolean>>(() => {
    // Resumed questions before the saved index are already answered + locked.
    const init: Record<string, boolean> = {};
    const savedAnswers = initialProgress?.answers ?? {};
    questions.forEach((q, i) => {
      if (i < initialIndex && savedAnswers[q._key]) init[q._key] = true;
    });
    // If the user left right after Submit, the saved current question is locked too.
    if (initialProgress?.currentSubmitted && questions[initialIndex]) {
      init[questions[initialIndex]._key] = true;
    }
    return init;
  });

  const heading = title || "Quick Check";

  if (total === 0) return null;

  // Persist answers + position (fire-and-forget). `completed` writes score+completion.
  function persist(
    index: number,
    ans: Record<string, string[]>,
    completed: boolean,
    currentSubmitted: boolean,
  ) {
    upsert.mutate({
      lessonId,
      answers: ans,
      currentQuestionIndex: index,
      currentSubmitted,
      isCompleted: completed,
      score: completed ? computeScore(questions, ans) : null,
      totalQuestions: total,
    });
  }

  const current = questions[currentIndex];
  const currentKey = current._key;
  const currentAnswer = answers[currentKey] ?? [];
  const isSubmitted = !!submitted[currentKey];
  const answeredEnough = isAnswered(current, currentAnswer);
  const primaryLabel = !isSubmitted
    ? "Submit"
    : currentIndex < total - 1
      ? "Next"
      : "Done";
  const primaryDisabled = !isSubmitted && !answeredEnough;

  function handleAnswerChange(next: string[]) {
    if (isSubmitted) return;
    setAnswers((prev) => ({ ...prev, [currentKey]: next }));
  }

  function handleSubmit() {
    setSubmitted((prev) => ({ ...prev, [currentKey]: true }));
    persist(currentIndex, answers, false, true);
  }

  async function handleNext() {
    if (currentIndex < total - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      persist(
        nextIndex,
        answers,
        false,
        !!submitted[questions[nextIndex]._key],
      );
      return;
    }
    const score = computeScore(questions, answers);
    try {
      await upsert.mutateAsync({
        lessonId,
        answers,
        currentQuestionIndex: currentIndex,
        currentSubmitted: true,
        isCompleted: true,
        score,
        totalQuestions: total,
      });
    } catch {
      // Persisting the result failed — stay on the quiz so the user can retry
      // rather than navigating away on a failed write.
      return;
    }
    trackQuizCompleted({ lessonId, submoduleId, moduleId, quizTitle: title });
    // Finishing the quiz is what completes the lesson (not merely reaching it).
    onLessonComplete();
    // No results screen — finishing always returns to the section page.
    router.push(sectionHref);
  }

  function handleBack() {
    if (currentIndex === 0) return;
    // Navigate back only — keep the previous question's answer + submitted state so
    // the user sees what they entered (the saved user_lesson_quiz_progress row stays
    // intact; navigating never clears an answer or persists a wipe).
    setCurrentIndex(currentIndex - 1);
  }

  return (
    <div>
      <h2 className="text-lg font-bold text-ink-secondary">{heading}</h2>

      <div className="mt-5 [&_p]:text-base [&_p]:text-ink-secondary">
        <PortableTextRenderer value={current.question_text} />
      </div>

      <div className="mt-4">
        <QuizQuestion
          question={current}
          answer={currentAnswer}
          submitted={isSubmitted}
          onChange={handleAnswerChange}
        />
      </div>

      <div className="mt-6 flex items-center gap-3">
        <button
          type="button"
          onClick={handleBack}
          disabled={currentIndex === 0}
          className="h-11 flex-1 rounded-md bg-surface-gray text-sm font-semibold text-ink-tertiary transition-colors hover:bg-surface-input disabled:opacity-50"
        >
          Back
        </button>
        <button
          type="button"
          onClick={isSubmitted ? handleNext : handleSubmit}
          disabled={primaryDisabled}
          className={cn(
            "h-11 flex-1 rounded-md text-sm font-semibold text-white transition-opacity",
            primaryDisabled ? "opacity-50" : "hover:opacity-90",
          )}
          style={{ backgroundColor: colorHex }}
        >
          {primaryLabel}
        </button>
      </div>
    </div>
  );
}
