"use client";

import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { cn } from "@/lib/utils";
import type { SanityQuizQuestion } from "@/types";
import { isNeutralQuestion } from "./grade";

interface MultipleChoiceQuestionProps {
  question: SanityQuizQuestion;
  /** Selected option `_key`s. */
  answer: string[];
  submitted: boolean;
  onChange: (next: string[]) => void;
}

/** Single (`multiple_choice_single` / `true_false`) and multi-select
 * (`multiple_choice_multiple`) questions. Checkboxes mirror the mobile UI;
 * after submit, correct options turn green and wrong picks turn red. A neutral
 * question (reflection) keeps its selection after submit and is never coloured
 * as correct or wrong. */
export function MultipleChoiceQuestion({
  question,
  answer,
  submitted,
  onChange,
}: MultipleChoiceQuestionProps) {
  const { t } = useTranslation();
  const multi = question.question_type === "multiple_choice_multiple";
  const neutral = isNeutralQuestion(question);
  const isTrueFalse = question.question_type === "true_false";
  // Square indicator for multi-select and True/False (matches mobile); single
  // choice stays round. (Selection logic still uses `multi`.)
  const squareIndicator = multi || isTrueFalse;
  const options = question.options ?? [];
  const selected = new Set(answer);

  function toggle(key: string) {
    if (submitted) return;
    if (multi) {
      const next = new Set(selected);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      onChange([...next]);
    } else {
      onChange([key]);
    }
  }

  return (
    <div>
      {multi && !neutral && (
        <p className="mb-4 text-center text-sm font-medium text-ink-muted">
          {t("learnWeb.practice.selectAll")}
        </p>
      )}
      <div className="flex flex-col gap-3">
        {options.map((opt) => {
          const isSelected = selected.has(opt._key);
          // Post-submit colouring. Never for a neutral question: its options
          // carry no correct answer, so a selection is not a wrong pick.
          const showCorrect = submitted && !neutral && opt.is_correct;
          const showWrong =
            submitted && !neutral && isSelected && !opt.is_correct;

          return (
            <button
              key={opt._key}
              type="button"
              onClick={() => toggle(opt._key)}
              disabled={submitted}
              aria-pressed={isSelected}
              className={cn(
                "flex items-start gap-3 rounded-card border p-4 text-left transition-colors",
                showCorrect
                  ? "border-priority-optional bg-priority-optional-bg"
                  : showWrong
                    ? "border-destructive bg-destructive/10"
                    : isSelected
                      ? "border-ink bg-surface-gray"
                      : "border-border-card bg-surface",
                !submitted && "hover:bg-surface-card",
              )}
            >
              <span
                className={cn(
                  "mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center border-2 transition-colors",
                  squareIndicator ? "rounded-md" : "rounded-full",
                  showCorrect
                    ? "border-priority-optional bg-priority-optional text-white"
                    : showWrong
                      ? "border-destructive bg-destructive text-white"
                      : isSelected
                        ? "border-ink bg-ink text-white"
                        : "border-border bg-surface",
                )}
                aria-hidden
              >
                {(isSelected || showCorrect) && (
                  <Check className="h-3 w-3" strokeWidth={3} />
                )}
              </span>
              <span
                className={cn(
                  "flex-1 [&_p]:text-ink-secondary",
                  isTrueFalse && "[&_p]:font-semibold",
                )}
              >
                <PortableTextRenderer value={opt.text} />
              </span>
            </button>
          );
        })}
      </div>

      {submitted && question.answer_box?.showAfterSubmit !== false &&
        question.answer_box?.content && (
          <div className="mt-5 border-s-4 border-ink-tertiary ps-4">
            <PortableTextRenderer value={question.answer_box.content} />
          </div>
        )}
    </div>
  );
}
