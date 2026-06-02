import type {
  SanityActivityInstruction,
  SanityBlock,
  SanityLessonQuiz,
  SanityPractice,
} from "@/types";

/**
 * Mock fallback used by services/learn.ts when Sanity isn't configured
 * (local dev without env vars). The real source is the `fercgabp/production`
 * Sanity dataset's `activity`-type `practice` documents (e.g. "Quick Check"
 * activities), whose questions live in `pages[].instructions[]`. Keyed to a
 * mock submodule id from lib/mock/modules.ts so the section Practice card +
 * quiz flow are testable without a backend.
 */

/** Single-span portable-text block array — for question_text / answer_box. */
function block(text: string): SanityBlock[] {
  return [
    {
      _key: `b-${text.slice(0, 8).replace(/\W/g, "")}`,
      _type: "block",
      style: "normal",
      markDefs: [],
      children: [{ _key: "s", _type: "span", marks: [], text }],
    },
  ];
}

/** A `block` instruction (Portable Text) inside an activity page. */
function blockInstruction(text: string): SanityActivityInstruction {
  return {
    _key: `bi-${text.slice(0, 8).replace(/\W/g, "")}`,
    _type: "block",
    style: "normal",
    markDefs: [],
    children: [{ _key: "s", _type: "span", marks: [], text }],
  };
}

export const mockPracticesBySubmodule: Record<string, SanityPractice[]> = {
  "mock-sub-docs-1": [
    {
      _id: "mock-practice-docs-1",
      _type: "practice",
      title: "Documents Activity",
      description: null,
      practice_type: "activity",
      order_number: 1,
      submodule: { _id: "mock-sub-docs-1", title: "First-week essentials" },
      pages: [
        {
          _key: "page-quick-check",
          title: "Quick Check",
          order: 0,
          answer_box: {
            content: block(
              "You need proof of identity and an address — a credit score and job offer aren't required.",
            ),
            showAfterSubmit: true,
          },
          instructions: [
            blockInstruction(
              "Which of these do you need to apply for a SIN in person?",
            ),
            {
              _key: "q-mc-multi",
              _type: "multiple_choice_multiple",
              question_text: block("Select all that apply."),
              options: [
                {
                  _key: "o1",
                  value: "a",
                  is_correct: true,
                  text: block("A valid passport or permanent resident card"),
                },
                {
                  _key: "o2",
                  value: "b",
                  is_correct: true,
                  text: block("Proof of address in Canada"),
                },
                {
                  _key: "o3",
                  value: "c",
                  is_correct: false,
                  text: block("A Canadian credit score"),
                },
                {
                  _key: "o4",
                  value: "d",
                  is_correct: false,
                  text: block("A job offer letter"),
                },
              ],
            },
          ],
        },
        {
          _key: "page-match",
          title: "Match it up",
          order: 1,
          instructions: [
            {
              _key: "q-match",
              _type: "matching_question",
              question_text: block("Match each document to where you get it:"),
              matching_pairs: [
                {
                  _key: "m1",
                  left_item: "Social Insurance Number",
                  right_item: "Service Canada",
                },
                {
                  _key: "m2",
                  left_item: "Provincial photo ID",
                  right_item: "Provincial agency",
                },
                {
                  _key: "m3",
                  left_item: "Health card",
                  right_item: "Provincial agency",
                },
              ],
            },
          ],
        },
      ],
    },
  ],
};

export function getMockPracticesBySubmodule(
  submoduleId: string,
): SanityPractice[] {
  return mockPracticesBySubmodule[submoduleId] ?? [];
}

/** Mock lesson-level "Quick Check" quizzes, keyed to a mock lesson id, so the
 * inline lesson quiz renders in local dev without a backend. */
export const mockLessonQuizzes: Record<string, SanityLessonQuiz[]> = {
  "mock-lesson-sin": [
    {
      _id: "mock-quiz-sin",
      _type: "quiz",
      title: "Quick Check",
      description: null,
      order_number: 1,
      questions: [
        {
          _key: "lq-1",
          question_type: "true_false",
          question_text: block(
            "True or False: you need a job offer to apply for a SIN.",
          ),
          order_number: 1,
          options: [
            { _key: "t", value: "true", is_correct: false, text: block("True") },
            { _key: "f", value: "false", is_correct: true, text: block("False") },
          ],
          answer_box: {
            content: block(
              "False — you can apply for a SIN without a job offer.",
            ),
            showAfterSubmit: true,
          },
        },
      ],
    },
  ],
};

export function getMockLessonQuiz(lessonId: string): SanityLessonQuiz[] {
  return mockLessonQuizzes[lessonId] ?? [];
}
