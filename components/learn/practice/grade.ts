import type { SanityQuizQuestion } from "@/types";

/**
 * Pure grading + answer-encoding helpers shared by the quiz renderers and the
 * PracticeQuiz orchestrator. Answers are stored as `string[]` per question:
 *   - choice / true-false → selected option `_key`s
 *   - matching            → `${pairKey}::${rightItem}` entries
 *   - free text           → a single-element `[text]`
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

/** Whether the submitted answer is correct. Long-answer reflections always pass. */
export function gradeQuestion(
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
    case "long_answer":
      // Open reflection — any non-empty response counts as complete.
      return (a[0]?.trim().length ?? 0) > 0;
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

/** Total correct over a question set for a given answers map. */
export function computeScore(
  questions: SanityQuizQuestion[],
  answers: Record<string, string[]>,
): number {
  return questions.reduce(
    (n, q) => n + (gradeQuestion(q, answers[q._key]) ? 1 : 0),
    0,
  );
}
