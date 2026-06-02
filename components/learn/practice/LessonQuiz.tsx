"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { useUpsertLessonQuizProgress } from "@/hooks/useLearn";
import { cn } from "@/lib/utils";
import type { SanityQuizQuestion } from "@/types";
import { QuizQuestion } from "./QuizQuestion";
import { computeScore, isAnswered } from "./grade";

interface LessonQuizProps {
  lessonId: string;
  title: string;
  questions: SanityQuizQuestion[];
  colorHex: string;
  /** Marks the lesson complete — fired when the quiz is finished (Done). */
  onLessonComplete: () => void;
  /** The submodule page — finishing navigates here (never the next lesson). */
  sectionHref: string;
}

/**
 * Inline "Quick Check" rendered mid-lesson. Reuses the shared QuizQuestion
 * renderers + grade.ts. Holds local quiz state (no mid-quiz resume); on finishing
 * it persists completion via useUpsertLessonQuizProgress and navigates back to the
 * section (no results screen). Back resets the target question for a fresh attempt.
 */
export function LessonQuiz({
  lessonId,
  title,
  questions,
  colorHex,
  onLessonComplete,
  sectionHref,
}: LessonQuizProps) {
  const router = useRouter();
  const upsert = useUpsertLessonQuizProgress();
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});

  const heading = title || "Quick Check";

  if (total === 0) return null;

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
  }

  function handleNext() {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    const score = computeScore(questions, answers);
    upsert.mutate({ lessonId, isCompleted: true, score, totalQuestions: total });
    // Finishing the quiz is what completes the lesson (not merely reaching it).
    onLessonComplete();
    // No results screen — finishing always returns to the section page.
    router.push(sectionHref);
  }

  function handleBack() {
    if (currentIndex === 0) return;
    const prevIndex = currentIndex - 1;
    const prevKey = questions[prevIndex]._key;
    // Fresh attempt: clear the target question's answer + submitted state.
    setAnswers((prev) => {
      const next = { ...prev };
      delete next[prevKey];
      return next;
    });
    setSubmitted((prev) => {
      const next = { ...prev };
      delete next[prevKey];
      return next;
    });
    setCurrentIndex(prevIndex);
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
