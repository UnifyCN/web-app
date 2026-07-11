"use client";

import { useMemo, useState } from "react";
import { Check, ChevronDown, Circle, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, portableTextToPlain } from "@/lib/utils";
import { Collapse } from "@/components/ui/Collapse";
import { flattenPractices } from "./flattenPractices";
import { gradeQuestion, isAnswered } from "./grade";
import type {
  PracticeProgress,
  QuizQuestionType,
  SanityPractice,
} from "@/types";

/** Question-type display keys (values live under learnWeb.practice.types). */
const TYPE_LABEL_KEYS: Record<QuizQuestionType, string> = {
  multiple_choice_single: "learnWeb.practice.types.multiple_choice_single",
  multiple_choice_multiple: "learnWeb.practice.types.multiple_choice_multiple",
  true_false: "learnWeb.practice.types.true_false",
  matching: "learnWeb.practice.types.matching",
  fill_blank: "learnWeb.practice.types.fill_blank",
  short_answer: "learnWeb.practice.types.short_answer",
  long_answer: "learnWeb.practice.types.long_answer",
};

interface PracticeQuestionListProps {
  practices: SanityPractice[];
  practiceProgress: PracticeProgress | null | undefined;
}

/**
 * Expandable breakdown of a section's practice questions: type + a one-line
 * preview + per-question answered/correct status. Mirrors the lesson-list
 * expand pattern. Overall score stays on the Practice card above.
 */
export function PracticeQuestionList({
  practices,
  practiceProgress,
}: PracticeQuestionListProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const flat = useMemo(() => flattenPractices(practices), [practices]);
  if (flat.length === 0) return null;

  const answers = practiceProgress?.answers ?? {};
  const score = practiceProgress?.score;
  const total = practiceProgress?.totalQuestions;

  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-2 rounded-card border border-border-card bg-surface px-4 py-2.5 text-left transition-all duration-200 hover:bg-surface-card active:scale-[0.99]"
      >
        <span className="text-sm font-semibold text-ink-secondary">
          {t("learnWeb.practice.questionsCount", { count: flat.length })}
          {score != null && total ? (
            <span className="ml-1 font-normal text-ink-placeholder">
              · {t("learnWeb.practice.scored", { score, total })}
            </span>
          ) : null}
        </span>
        <ChevronDown
          className={cn(
            "h-5 w-5 shrink-0 text-ink-placeholder transition-transform",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      <Collapse open={open}>
        <ol className="mt-2 space-y-1.5">
          {flat.map(({ question }, i) => {
            const ans = answers[question._key];
            const answered = isAnswered(question, ans);
            const correct = answered && gradeQuestion(question, ans);
            const preview = portableTextToPlain(question.question_text)
              .split("\n")[0]
              .slice(0, 90);
            return (
              <li
                key={question._key}
                className="flex items-start gap-3 rounded-md border border-border-card bg-surface px-3 py-2.5"
              >
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center">
                  {answered ? (
                    correct ? (
                      <Check
                        className="h-4 w-4 text-priority-optional"
                        strokeWidth={3}
                        aria-label={t("learnWeb.practice.correctAria")}
                      />
                    ) : (
                      <X
                        className="h-4 w-4 text-destructive"
                        strokeWidth={3}
                        aria-label={t("learnWeb.practice.incorrectAria")}
                      />
                    )
                  ) : (
                    <Circle
                      className="h-3.5 w-3.5 text-ink-placeholder"
                      aria-label={t("learnWeb.practice.notAnsweredAria")}
                    />
                  )}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
                    {t("learnWeb.practice.questionAbbrev", { number: i + 1 })} ·{" "}
                    {t(TYPE_LABEL_KEYS[question.question_type])}
                  </p>
                  {preview && (
                    <p className="mt-0.5 truncate text-sm text-ink-secondary">
                      {preview}
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </Collapse>
    </div>
  );
}
