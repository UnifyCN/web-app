"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { useUpsertPracticeProgress } from "@/hooks/useLearn";
import { cn } from "@/lib/utils";
import type { PracticeProgress, SanityQuizQuestion } from "@/types";
import { QuizProgressBar } from "./QuizProgressBar";
import { MultipleChoiceQuestion } from "./MultipleChoiceQuestion";
import { MatchingQuestion } from "./MatchingQuestion";
import { FreeTextQuestion } from "./FreeTextQuestion";
import { TakeABreakModal } from "./TakeABreakModal";
import { QuizResults } from "./QuizResults";
import { computeScore, isAnswered } from "./grade";

export interface FlatQuestion {
  question: SanityQuizQuestion;
  /** Title of the parent practice doc — shown as the question heading. */
  practiceTitle: string;
}

interface PracticeQuizProps {
  moduleId: string;
  submoduleId: string;
  sectionNumber: number;
  submoduleTitle: string;
  colorHex: string;
  questions: FlatQuestion[];
  initialProgress: PracticeProgress | null;
}

const CHOICE_TYPES = new Set([
  "multiple_choice_single",
  "multiple_choice_multiple",
  "true_false",
]);

export function PracticeQuiz({
  moduleId,
  submoduleId,
  sectionNumber,
  submoduleTitle,
  colorHex,
  questions,
  initialProgress,
}: PracticeQuizProps) {
  const router = useRouter();
  const upsert = useUpsertPracticeProgress();
  const total = questions.length;
  const sectionHref = `/learn/${moduleId}/${submoduleId}`;

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
    questions.forEach((fq, i) => {
      if (i < initialIndex && (initialProgress?.answers ?? {})[fq.question._key]) {
        init[fq.question._key] = true;
      }
    });
    // If the user left right after Submit, the saved current question is locked
    // too — restore its feedback on resume.
    if (initialProgress?.currentSubmitted && questions[initialIndex]) {
      init[questions[initialIndex].question._key] = true;
    }
    return init;
  });
  const [showResults, setShowResults] = useState(
    initialProgress?.isCompleted ?? false,
  );
  const [breakOpen, setBreakOpen] = useState(false);

  const current = questions[currentIndex];
  const currentKey = current?.question._key;
  const currentAnswer = (currentKey && answers[currentKey]) || [];
  const isSubmitted = !!(currentKey && submitted[currentKey]);

  const finalScore = useMemo(
    () => computeScore(questions.map((q) => q.question), answers),
    [questions, answers],
  );

  function persist(
    index: number,
    ans: Record<string, string[]>,
    completed: boolean,
    currentSubmitted: boolean,
  ) {
    upsert.mutate({
      submoduleId,
      moduleId,
      currentQuestionIndex: index,
      currentSubmitted,
      answers: ans,
      isCompleted: completed,
      score: completed ? computeScore(questions.map((q) => q.question), ans) : null,
      totalQuestions: total,
    });
  }

  function handleAnswerChange(next: string[]) {
    if (!currentKey || isSubmitted) return;
    setAnswers((prev) => ({ ...prev, [currentKey]: next }));
  }

  function handleSubmit() {
    if (!currentKey) return;
    const nextSubmitted = { ...submitted, [currentKey]: true };
    setSubmitted(nextSubmitted);
    persist(currentIndex, answers, false, true);
  }

  function handleNext() {
    if (currentIndex < total - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      persist(
        nextIndex,
        answers,
        false,
        !!submitted[questions[nextIndex].question._key],
      );
    } else {
      // Done.
      persist(currentIndex, answers, true, true);
      setShowResults(true);
    }
  }

  function handleBack() {
    if (currentIndex > 0) setCurrentIndex(currentIndex - 1);
  }

  function handleSaveAndLeave() {
    persist(currentIndex, answers, false, isSubmitted);
    router.push(sectionHref);
  }

  if (total === 0) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          There&rsquo;s no practice for this section yet.
        </p>
        <button
          type="button"
          onClick={() => router.push(sectionHref)}
          className="mt-3 text-sm font-semibold text-primary"
        >
          Back to section
        </button>
      </div>
    );
  }

  if (showResults) {
    return (
      <QuizResults
        score={finalScore}
        total={total}
        colorHex={colorHex}
        sectionHref={sectionHref}
      />
    );
  }

  const answeredEnough = isAnswered(current.question, currentAnswer);
  const primaryLabel = !isSubmitted
    ? "Submit"
    : currentIndex < total - 1
      ? "Next"
      : "Done";
  const primaryDisabled = !isSubmitted && !answeredEnough;

  const qType = current.question.question_type;

  return (
    <div className="flex min-h-screen flex-col">
      <div className="mx-auto w-full max-w-[760px] flex-1 px-6 py-6">
        <QuizProgressBar
          sectionNumber={sectionNumber}
          title={submoduleTitle}
          percent={((currentIndex + 1) / total) * 100}
          colorHex={colorHex}
          onClose={() => setBreakOpen(true)}
        />

        <h2 className="text-2xl font-bold text-ink-secondary">
          {current.practiceTitle}
        </h2>
        <div className="mt-2 [&_p]:text-base [&_p]:text-ink-secondary">
          <PortableTextRenderer value={current.question.question_text} />
        </div>

        <div className="mt-6">
          {CHOICE_TYPES.has(qType) ? (
            <MultipleChoiceQuestion
              question={current.question}
              answer={currentAnswer}
              submitted={isSubmitted}
              onChange={handleAnswerChange}
            />
          ) : qType === "matching" ? (
            <MatchingQuestion
              question={current.question}
              answer={currentAnswer}
              submitted={isSubmitted}
              onChange={handleAnswerChange}
            />
          ) : (
            <FreeTextQuestion
              question={current.question}
              answer={currentAnswer}
              submitted={isSubmitted}
              onChange={handleAnswerChange}
            />
          )}
        </div>
      </div>

      {/* Bottom action bar — sticky within the content column (clears the
          sidebar) and pinned to the viewport bottom while scrolling. */}
      <div className="sticky bottom-0 border-t border-border-card bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex max-w-[760px] items-center gap-3 px-6 py-4">
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
              "inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white transition-opacity",
              primaryDisabled ? "opacity-50" : "hover:opacity-90",
            )}
            style={{ backgroundColor: colorHex }}
          >
            {primaryLabel}
            {primaryLabel === "Next" && (
              <ArrowRight className="h-4 w-4" aria-hidden />
            )}
          </button>
        </div>
      </div>

      <TakeABreakModal
        open={breakOpen}
        onSaveAndLeave={handleSaveAndLeave}
        onContinue={() => setBreakOpen(false)}
      />
    </div>
  );
}
