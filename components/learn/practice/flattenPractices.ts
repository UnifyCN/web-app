import type {
  QuizQuestionType,
  SanityActivityInstruction,
  SanityBlock,
  SanityPractice,
  SanityQuizQuestion,
} from "@/types";
import type { FlatQuestion } from "./PracticeQuiz";

/**
 * Flatten a section's practices into the quiz flow, handling both shapes:
 * - `quiz` practices keep their questions in `questions[]` (already
 *   `SanityQuizQuestion`s) — used directly.
 * - `activity` practices keep their content in `pages[].instructions[]` (a mix
 *   of `block` portable text, free-text input boxes, and choice / matching
 *   questions). We walk each page, treat leading `block`s as the prompt context
 *   for the next question, and emit a `SanityQuizQuestion` per question
 *   instruction.
 *
 * Either way the existing renderers (MultipleChoiceQuestion / MatchingQuestion /
 * FreeTextQuestion) and `gradeQuestion` handle the output unchanged.
 */

/** Activity instruction `_type` → the quiz `question_type` a renderer handles. */
const INSTRUCTION_TYPE_MAP: Record<string, QuizQuestionType> = {
  multiple_choice_single: "multiple_choice_single",
  multiple_choice_multiple: "multiple_choice_multiple",
  two_options_question: "true_false",
  matching_question: "matching",
  large_input_box: "long_answer",
  mid_input_box: "short_answer",
  small_input_box: "short_answer",
};

/** A `block` instruction already is a Portable Text block; normalize children. */
function instructionToBlock(ins: SanityActivityInstruction): SanityBlock {
  return { ...(ins as unknown as SanityBlock), children: ins.children ?? [] };
}

export function flattenPractices(
  practices: SanityPractice[],
): FlatQuestion[] {
  const flat: FlatQuestion[] = [];
  // Global running index so every emitted question gets a unique order_number
  // across all pages and practices (not reset per page).
  let order = 0;

  for (const practice of practices) {
    // Quiz practices keep their questions in `questions[]` (already
    // SanityQuizQuestions, ordered by the GROQ). Activity practices embed them
    // in `pages[].instructions[]` (handled below).
    if (practice.practice_type === "quiz") {
      for (const question of practice.questions ?? []) {
        flat.push({
          question: { ...question, order_number: order++ },
          practiceTitle: practice.title,
        });
      }
      continue;
    }

    const pages = (practice.pages ?? [])
      .slice()
      .sort((a, b) => a.order - b.order);

    for (const page of pages) {
      const heading = page.title || practice.title;
      let context: SanityBlock[] = [];

      for (const ins of page.instructions ?? []) {
        if (ins._type === "block") {
          context.push(instructionToBlock(ins));
          continue;
        }

        const questionType = INSTRUCTION_TYPE_MAP[ins._type];
        if (!questionType) continue; // checklist_checkbox / unknown → skip

        const question: SanityQuizQuestion = {
          _key: ins._key,
          question_type: questionType,
          question_text: [...context, ...(ins.question_text ?? [])],
          options: ins.options,
          matching_pairs: ins.matching_pairs,
          order_number: order++,
          answer_box: page.answer_box ?? null,
        };
        flat.push({ question, practiceTitle: heading });
        context = [];
      }
    }
  }

  return flat;
}
