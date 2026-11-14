import type { SanityQuizQuestion } from "@/types";

/*
 * Quick Check answers in the mobile app's format, so both apps share them in
 * `user_quiz_responses` (one row per attempt + question `_key`):
 *  - single choice / true-false: the option `_key` (a string)
 *  - multiple choice: an array of option `_key`s
 *  - free text (short_answer, fill_blank, long_answer): the text (a string)
 *  - matching: not stored (mobile doesn't persist matching progress)
 * `gradeQuizAnswer` is copied from mobile `utils/gradeQuizAnswer.ts` (with
 * `isTextAnswerQuestion` from `utils/quizAnswer.ts`), origin/main 8aef964b.
 * Keep them identical to mobile's.
 */

const TEXT_ANSWER_TYPES = new Set([
  "short_answer",
  "fill_blank",
  "long_answer",
]);

export function isTextAnswerQuestion(
  questionType: string | null | undefined,
): boolean {
  return Boolean(questionType && TEXT_ANSWER_TYPES.has(questionType));
}

type GradableQuestion = {
  question_type?: string | null;
  correct_answer?: { value?: string | string[] | null } | null;
  options?: Array<{ _key?: string; is_correct?: boolean }> | null;
};

/** Grade stored answer values without treating a string as an array. */
export function gradeQuizAnswer(
  question: GradableQuestion | null | undefined,
  answer: string | string[],
): boolean {
  if (!question) return false;
  const values = Array.isArray(question.correct_answer?.value)
    ? question.correct_answer.value
    : [question.correct_answer?.value];
  if (isTextAnswerQuestion(question.question_type)) {
    const normalize = (value: string) => {
      const text = value
        .normalize("NFKC")
        .trim()
        .toLocaleLowerCase()
        .replace(/\s+/g, " ");
      const numeric = text.replace(/[$,\s]/g, "");
      return /^[-+]?\d+(\.\d+)?$/.test(numeric)
        ? String(Number(numeric))
        : text;
    };
    const single = Array.isArray(answer) ? answer[0] : answer;
    return (
      !!single?.trim() &&
      values.some(
        (value: unknown) =>
          typeof value === "string" && normalize(value) === normalize(single),
      )
    );
  }
  if (question.question_type === "multiple_choice_multiple") {
    const ids = (question.options || [])
      .filter((o) => o.is_correct)
      .map((o) => o._key);
    const selected = Array.isArray(answer) ? answer : [];
    return (
      ids.length > 0 &&
      ids.every((id) => !!id && selected.includes(id)) &&
      selected.every((id) => ids.includes(id))
    );
  }
  const single = Array.isArray(answer) ? answer[0] : answer;
  return (
    (!!single && values.includes(single)) ||
    !!question.options?.find((o) => o._key === single)?.is_correct
  );
}

/** Web keeps every answer as `string[]`; this is the value mobile stores, or
 * undefined when nothing should be stored (matching, or no answer yet). */
export function toStoredAnswer(
  question: Pick<SanityQuizQuestion, "question_type">,
  answer: string[] | undefined,
): string | string[] | undefined {
  if (!answer || answer.length === 0) return undefined;
  if (question.question_type === "matching") return undefined;
  if (question.question_type === "multiple_choice_multiple") return [...answer];
  return answer[0];
}

/** A stored mobile answer back in web's `string[]` form. */
export function fromStoredAnswer(
  question: Pick<SanityQuizQuestion, "question_type">,
  stored: unknown,
): string[] | undefined {
  if (stored === null || stored === undefined) return undefined;
  if (question.question_type === "matching") return undefined;
  if (Array.isArray(stored)) return stored.map(String);
  return [String(stored)];
}
