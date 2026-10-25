import type { PracticeProgress, SanityQuizQuestion } from "@/types";
import {
  gradeAnswer,
  hasNeutralQuestion,
  isAnswered,
  parseMatching,
  summarizeKnowledge,
} from "./grade";

/**
 * Display helpers for saved practice progress. Saved `score` and
 * `total_questions` count every question, neutral ones included, so a ratio
 * built from them is wrong for a set with a reflection. These helpers build
 * the knowledge score from current content and the saved answers, and give
 * back `null` (show no number) when that evidence is not complete.
 */

export interface KnowledgeScoreDisplay {
  correct: number;
  total: number;
  percent: number;
}

type SavedScoreInput = Pick<
  PracticeProgress,
  "isCompleted" | "score" | "totalQuestions" | "answers"
>;

function toDisplay(correct: number, total: number): KnowledgeScoreDisplay {
  return { correct, total, percent: Math.round((correct / total) * 100) };
}

/** Saved choices must still belong to the current question. */
function hasUsableSavedAnswer(
  question: SanityQuizQuestion,
  answer: unknown,
): boolean {
  if (
    !Array.isArray(answer) ||
    !answer.every((value) => typeof value === "string")
  ) return false;
  if (!isAnswered(question, answer)) return false;
  switch (question.question_type) {
    case "multiple_choice_single":
    case "true_false":
      return (
        answer.length === 1 &&
        !!question.options?.some((option) => option._key === answer[0])
      );
    case "multiple_choice_multiple": {
      const keys = new Set(question.options?.map((option) => option._key));
      return (
        new Set(answer).size === answer.length &&
        answer.every((key) => keys.has(key))
      );
    }
    case "matching": {
      const pairs = question.matching_pairs ?? [];
      const selected = parseMatching(answer);
      const values = new Set(pairs.map((pair) => pair.right_item));
      return (
        answer.length === pairs.length &&
        selected.size === pairs.length &&
        pairs.every(
          (pair) => selected.has(pair._key) && values.has(selected.get(pair._key) ?? ""),
        )
      );
    }
    case "fill_blank":
    case "short_answer":
    case "long_answer":
      return answer.length === 1;
  }
}

/**
 * The knowledge score to show for a section, or `null` to show no number.
 *
 * - Content unknown, no progress or no questions: `null`.
 * - Knowledge-only content: the saved score and total, as before.
 * - Content with a neutral question: derived from the current questions and the
 *   saved answers. It needs a completed attempt, a saved total (if any) equal
 *   to the current question count, and a usable saved answer for every
 *   question. A saved aggregate is never trusted for such a set.
 * - No knowledge question at all (reflection only): `null`.
 */
export function displayKnowledgeScore(
  questions: readonly SanityQuizQuestion[] | null | undefined,
  progress: SavedScoreInput | null | undefined,
): KnowledgeScoreDisplay | null {
  if (!questions || questions.length === 0 || !progress) return null;

  if (!hasNeutralQuestion(questions)) {
    const { score, totalQuestions } = progress;
    return score != null && totalQuestions
      ? toDisplay(score, totalQuestions)
      : null;
  }

  if (!progress.isCompleted) return null;
  if (
    progress.totalQuestions != null &&
    progress.totalQuestions !== questions.length
  ) {
    return null;
  }
  const answers = progress.answers ?? {};
  if (!questions.every((q) => hasUsableSavedAnswer(q, answers[q._key]))) return null;

  const { correct, total } = summarizeKnowledge(questions, answers);
  return total > 0 ? toDisplay(correct, total) : null;
}

/** What the question breakdown shows for one question. */
export type QuestionStatus =
  | "unanswered"
  | "draft"
  | "neutral"
  | "correct"
  | "incorrect";

/**
 * Whether the saved answer at `index` was submitted. This is the rule the quiz
 * uses to restore a resumed attempt: a completed attempt is all submitted,
 * questions before the saved position are submitted, the saved position is
 * submitted only when `currentSubmitted` is set, and any later answer is a draft.
 */
export function wasSubmitted(
  index: number,
  progress: Pick<
    PracticeProgress,
    "isCompleted" | "currentQuestionIndex" | "currentSubmitted"
  > | null | undefined,
): boolean {
  if (!progress) return false;
  if (progress.isCompleted) return true;
  if (index < progress.currentQuestionIndex) return true;
  return index === progress.currentQuestionIndex && progress.currentSubmitted;
}

export function questionStatus(
  question: SanityQuizQuestion,
  answer: string[] | undefined,
  submitted: boolean,
): QuestionStatus {
  if (!isAnswered(question, answer)) return "unanswered";
  if (!submitted) return "draft";
  const grade = gradeAnswer(question, answer);
  if (grade.kind === "neutral") return "neutral";
  return grade.correct ? "correct" : "incorrect";
}
