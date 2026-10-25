import type { SanityQuizQuestion } from "@/types";

/**
 * Pure grading + answer-encoding helpers shared by the quiz renderers and the
 * PracticeQuiz orchestrator. Answers are stored as `string[]` per question:
 *   - choice / true-false → selected option `_key`s
 *   - matching            → `${pairKey}::${rightItem}` entries
 *   - free text           → a single-element `[text]`
 *
 * Grading is knowledge-only. A neutral question (see `isNeutralQuestion`) is
 * answered and saved but is not part of any correct count or total.
 */

export const MATCH_SEP = "::";

export function encodeMatch(pairKey: string, rightItem: string): string {
  return `${pairKey}${MATCH_SEP}${rightItem}`;
}

/** Map of matching pair `_key` → chosen right-item category. */
export function parseMatching(answer: string[]): Map<string, string> {
  return new Map(
    answer.map((entry) => {
      const i = entry.indexOf(MATCH_SEP);
      return i === -1
        ? [entry, ""]
        : [entry.slice(0, i), entry.slice(i + MATCH_SEP.length)];
    }),
  );
}

function norm(s: string): string {
  return s.trim().toLowerCase();
}

function setEqual(a: string[], b: string[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((x) => sb.has(x));
}

/** Whether the question has enough of an answer to allow Submit. */
export function isAnswered(
  q: SanityQuizQuestion,
  answer: string[] | undefined,
): boolean {
  const a = answer ?? [];
  switch (q.question_type) {
    case "matching": {
      const pairs = q.matching_pairs ?? [];
      const map = parseMatching(a);
      return pairs.length > 0 && pairs.every((p) => map.has(p._key));
    }
    case "fill_blank":
    case "short_answer":
    case "long_answer":
      return (a[0]?.trim().length ?? 0) > 0;
    default:
      return a.length > 0;
  }
}

/**
 * A question is neutral when it is answered and saved but never marked correct
 * or incorrect: an explicit `gradingMode: "reflection"`, or the legacy
 * `long_answer` type (an open reflection). Nothing else makes a question
 * neutral. Option flags, titles and missing accepted answers never do.
 */
export function isNeutralQuestion(
  q: Pick<SanityQuizQuestion, "question_type" | "gradingMode">,
): boolean {
  return q.gradingMode === "reflection" || q.question_type === "long_answer";
}

/**
 * The outcome of one answer. `neutral` is its own case, so a caller cannot
 * read a reflection as `correct: false` by falling back on a boolean.
 */
export type QuestionGrade =
  | { kind: "neutral" }
  | { kind: "knowledge"; correct: boolean };

/** Whether a knowledge answer is correct. Never called for a neutral question. */
function isKnowledgeCorrect(
  q: SanityQuizQuestion,
  answer: string[] | undefined,
): boolean {
  const a = answer ?? [];
  switch (q.question_type) {
    case "multiple_choice_multiple":
    case "multiple_choice_single":
    case "true_false": {
      const correct = (q.options ?? [])
        .filter((o) => o.is_correct)
        .map((o) => o._key);
      return correct.length > 0 && setEqual(a, correct);
    }
    case "matching": {
      const pairs = q.matching_pairs ?? [];
      const map = parseMatching(a);
      return (
        pairs.length > 0 && pairs.every((p) => map.get(p._key) === p.right_item)
      );
    }
    case "short_answer":
    case "fill_blank": {
      const accepted = (q.correct_answer?.value ?? []).map(norm);
      const given = norm(a[0] ?? "");
      return accepted.length === 0
        ? given.length > 0
        : accepted.includes(given);
    }
    default:
      return false;
  }
}

/** Grade one submitted answer. Neutral questions get no correctness result. */
export function gradeAnswer(
  q: SanityQuizQuestion,
  answer: string[] | undefined,
): QuestionGrade {
  if (isNeutralQuestion(q)) return { kind: "neutral" };
  return { kind: "knowledge", correct: isKnowledgeCorrect(q, answer) };
}

/** Knowledge result of a question set. Neutral questions are in neither number. */
export interface KnowledgeSummary {
  correct: number;
  total: number;
}

export function summarizeKnowledge(
  questions: readonly SanityQuizQuestion[],
  answers: Record<string, string[]>,
): KnowledgeSummary {
  let correct = 0;
  let total = 0;
  for (const q of questions) {
    const grade = gradeAnswer(q, answers[q._key]);
    if (grade.kind === "neutral") continue;
    total += 1;
    if (grade.correct) correct += 1;
  }
  return { correct, total };
}

export function hasNeutralQuestion(
  questions: readonly SanityQuizQuestion[],
): boolean {
  return questions.some(isNeutralQuestion);
}

/**
 * The `score` to save for a finished attempt. Stored `total_questions` is the
 * full question count, so a knowledge-only count would read as a wrong ratio.
 * An attempt that has a neutral question therefore saves `null`; the web view
 * derives the knowledge score from content and answers instead.
 */
export function scoreToSave(
  questions: readonly SanityQuizQuestion[],
  answers: Record<string, string[]>,
): number | null {
  if (hasNeutralQuestion(questions)) return null;
  return summarizeKnowledge(questions, answers).correct;
}
