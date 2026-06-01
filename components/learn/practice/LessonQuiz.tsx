"use client";

import { useState } from "react";
import { Check } from "lucide-react";
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
  /** Set when the lesson's Quick Check was already completed (from progress). */
  initialResult: { score: number; total: number } | null;
}

/**
 * Inline "Quick Check" rendered mid-lesson. Reuses the shared QuizQuestion
 * renderers + grade.ts. Holds local quiz state (no mid-quiz resume); on finishing
 * it persists completion via useUpsertLessonQuizProgress and shows a checkmark.
 * Back resets the target question for a fresh attempt (matches mobile).
 */
export function LessonQuiz({
  lessonId,
  title,
  questions,
  colorHex,
  initialResult,
}: LessonQuizProps) {
  const upsert = useUpsertLessonQuizProgress();
  const total = questions.length;

  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [submitted, setSubmitted] = useState<Record<string, boolean>>({});
  const [result, setResult] = useState<{ score: number; total: number } | null>(
    initialResult,
  );

  const heading = title || "Quick Check";

  function handleRetake() {
    setAnswers({});
    setSubmitted({});
    setCurrentIndex(0);
    setResult(null);
  }

  if (total === 0) return null;

  // ---- Completed state (just finished, or resumed-from-progress) ----------
  if (result) {
    const pct =
      result.total > 0 ? Math.round((result.score / result.total) * 100) : 0;
    return (
      <div>
        <div className="flex items-center gap-2">
          <span
            className="flex h-6 w-6 items-center justify-center rounded-full"
            style={{ backgroundColor: colorHex }}
          >
            <Check className="h-4 w-4 text-white" strokeWidth={3} aria-hidden />
          </span>
          <h2 className="text-lg font-bold text-ink-secondary">
            {heading} complete
          </h2>
        </div>
        <p className="mt-2 text-sm text-ink-muted">
          You scored {result.score}/{result.total} ({pct}%).
        </p>
        <button
          type="button"
          onClick={handleRetake}
          className="mt-3 text-sm font-semibold text-primary transition-colors hover:text-primary-dark"
        >
          Retake quick check
        </button>
      </div>
    );
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
  }

  function handleNext() {
    if (currentIndex < total - 1) {
      setCurrentIndex((i) => i + 1);
      return;
    }
    const score = computeScore(questions, answers);
    setResult({ score, total });
    upsert.mutate({ lessonId, isCompleted: true, score, totalQuestions: total });
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
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-input">
        <div
          className="h-full rounded-full transition-all duration-300 ease-out"
          style={{
            width: `${((currentIndex + 1) / total) * 100}%`,
            backgroundColor: colorHex,
          }}
        />
      </div>

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
