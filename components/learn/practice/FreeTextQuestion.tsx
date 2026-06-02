"use client";

import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import type { SanityQuizQuestion } from "@/types";

interface FreeTextQuestionProps {
  question: SanityQuizQuestion;
  /** Single-element `[text]`. */
  answer: string[];
  submitted: boolean;
  onChange: (next: string[]) => void;
}

/** Free-text questions (`long_answer` reflection, or `short_answer` /
 * `fill_blank` checked against `correct_answer.value`). */
export function FreeTextQuestion({
  question,
  answer,
  submitted,
  onChange,
}: FreeTextQuestionProps) {
  const value = answer[0] ?? "";
  const accepted = question.correct_answer?.value ?? [];
  const isReflection = question.question_type === "long_answer";

  return (
    <div>
      <textarea
        value={value}
        onChange={(e) => onChange([e.target.value])}
        disabled={submitted}
        placeholder="Type here…"
        rows={isReflection ? 8 : 3}
        className="w-full resize-none rounded-card border border-border-card bg-surface p-4 text-sm text-ink-secondary outline-none transition-colors placeholder:text-ink-placeholder focus:border-ink disabled:opacity-70"
      />

      {submitted && !isReflection && accepted.length > 0 && (
        <p className="mt-3 text-sm text-ink-muted">
          Accepted answer:{" "}
          <span className="font-semibold text-ink-secondary">
            {accepted.join(", ")}
          </span>
        </p>
      )}

      {submitted && question.answer_box?.showAfterSubmit !== false &&
        question.answer_box?.content && (
          <div className="mt-5 border-l-4 border-ink-tertiary pl-4">
            <PortableTextRenderer value={question.answer_box.content} />
          </div>
        )}
    </div>
  );
}
