"use client";

import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { cn } from "@/lib/utils";
import type { SanityQuizQuestion } from "@/types";
import { encodeMatch, parseMatching } from "./grade";

interface MatchingQuestionProps {
  question: SanityQuizQuestion;
  /** `${pairKey}::${rightItem}` entries. */
  answer: string[];
  submitted: boolean;
  onChange: (next: string[]) => void;
}

/**
 * Matching question. Right items repeat (they're categories, e.g.
 * Landlord/Tenant), so each left item picks one of the *unique* right-side
 * categories. After submit, each row turns green/red against its correct pair.
 */
export function MatchingQuestion({
  question,
  answer,
  submitted,
  onChange,
}: MatchingQuestionProps) {
  const pairs = question.matching_pairs ?? [];
  const categories = [...new Set(pairs.map((p) => p.right_item))];
  const selected = parseMatching(answer);

  function choose(pairKey: string, category: string) {
    if (submitted) return;
    const next = new Map(selected);
    next.set(pairKey, category);
    onChange([...next.entries()].map(([k, v]) => encodeMatch(k, v)));
  }

  return (
    <div>
      <div className="flex flex-col gap-3">
        {pairs.map((pair) => {
          const chosen = selected.get(pair._key);
          const correct = submitted && chosen === pair.right_item;
          const wrong = submitted && chosen !== undefined && !correct;
          return (
            <div
              key={pair._key}
              className={cn(
                "rounded-card border p-4",
                correct
                  ? "border-priority-optional bg-priority-optional-bg"
                  : wrong
                    ? "border-destructive bg-destructive/10"
                    : "border-border-card bg-surface",
              )}
            >
              <p className="text-sm font-semibold text-ink-secondary">
                {pair.left_item}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {categories.map((category) => {
                  const isChosen = chosen === category;
                  return (
                    <button
                      key={category}
                      type="button"
                      onClick={() => choose(pair._key, category)}
                      disabled={submitted}
                      aria-pressed={isChosen}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-semibold",
                        isChosen
                          ? "border-ink bg-ink text-white"
                          : "border-border-card bg-surface text-ink-secondary",
                        !submitted && "hover:bg-surface-gray",
                      )}
                    >
                      {category}
                    </button>
                  );
                })}
              </div>
              {submitted && wrong && (
                <p className="mt-2 text-xs font-medium text-ink-muted">
                  Correct answer:{" "}
                  <span className="text-ink-secondary">{pair.right_item}</span>
                </p>
              )}
            </div>
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
