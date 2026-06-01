"use client";

import { Check } from "lucide-react";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { cn } from "@/lib/utils";
import type { SanityQuizQuestion } from "@/types";

interface MultipleChoiceQuestionProps {
  question: SanityQuizQuestion;
  /** Selected option `_key`s. */
  answer: string[];
  submitted: boolean;
  onChange: (next: string[]) => void;
}

/** Single (`multiple_choice_single` / `true_false`) and multi-select
 * (`multiple_choice_multiple`) questions. Checkboxes mirror the mobile UI;
 * after submit, correct options turn green and wrong picks turn red. */
export function MultipleChoiceQuestion({
  question,
  answer,
  submitted,
  onChange,
}: MultipleChoiceQuestionProps) {
  const multi = question.question_type === "multiple_choice_multiple";
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
      {multi && (
        <p className="mb-4 text-center text-sm font-medium text-ink-muted">
          Select all that apply.
        </p>
      )}
      <div className="flex flex-col gap-3">
        {options.map((opt) => {
          const isSelected = selected.has(opt._key);
          // Post-submit colouring.
          const showCorrect = submitted && opt.is_correct;
          const showWrong = submitted && isSelected && !opt.is_correct;

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
                  ? "border-[#10B981] bg-[#10B981]/10"
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
                  multi ? "rounded-md" : "rounded-full",
                  showCorrect
                    ? "border-[#10B981] bg-[#10B981] text-white"
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
              <span className="flex-1 [&_p]:text-ink-secondary">
                <PortableTextRenderer value={opt.text} />
              </span>
            </button>
          );
        })}
      </div>

      {submitted && question.answer_box?.showAfterSubmit !== false &&
        question.answer_box?.content && (
          <div className="mt-5 border-l-4 border-ink-tertiary pl-4">
            <PortableTextRenderer value={question.answer_box.content} />
          </div>
        )}
    </div>
  );
}
