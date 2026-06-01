import type { SanityBlock, SanityPractice } from "@/types";

/**
 * Mock fallback used by services/learn.ts when Sanity isn't configured
 * (local dev without env vars). The real source is the `fercgabp/production`
 * Sanity dataset's quiz-type `practice` documents. Keyed to a mock submodule
 * id from lib/mock/modules.ts so the section page + quiz flow are testable
 * without a Sanity/Supabase backend.
 */

/** Minimal single-span portable-text block helper for mock content. */
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

export const mockPracticesBySubmodule: Record<string, SanityPractice[]> = {
  "mock-sub-docs-1": [
    {
      _id: "mock-practice-docs-1",
      _type: "practice",
      title: "Documents Quick Check",
      description: null,
      practice_type: "quiz",
      order_number: 1,
      submodule: { _id: "mock-sub-docs-1", title: "First-week essentials" },
      questions: [
        {
          _key: "q-mc-multi",
          question_type: "multiple_choice_multiple",
          question_text: block(
            "Which of these do you need to apply for a SIN in person?",
          ),
          order_number: 1,
          options: [
            {
              _key: "o1",
              value: "option_a",
              is_correct: true,
              text: block("A valid passport or permanent resident card"),
            },
            {
              _key: "o2",
              value: "option_b",
              is_correct: true,
              text: block("Proof of address in Canada"),
            },
            {
              _key: "o3",
              value: "option_c",
              is_correct: false,
              text: block("A Canadian credit score"),
            },
            {
              _key: "o4",
              value: "option_d",
              is_correct: false,
              text: block("A job offer letter"),
            },
          ],
          answer_box: {
            content: block(
              "You need proof of identity and an address — a credit score and job offer are not required.",
            ),
            showAfterSubmit: true,
          },
        },
        {
          _key: "q-mc-single",
          question_type: "multiple_choice_single",
          question_text: block("How many digits is a Social Insurance Number?"),
          order_number: 2,
          options: [
            { _key: "o1", value: "v7", is_correct: false, text: block("7 digits") },
            { _key: "o2", value: "v9", is_correct: true, text: block("9 digits") },
            { _key: "o3", value: "v11", is_correct: false, text: block("11 digits") },
          ],
          answer_box: {
            content: block("A SIN is a 9-digit number."),
            showAfterSubmit: true,
          },
        },
        {
          _key: "q-match",
          question_type: "matching",
          question_text: block("Match each document to where you get it:"),
          order_number: 3,
          matching_pairs: [
            { _key: "m1", left_item: "Social Insurance Number", right_item: "Service Canada" },
            { _key: "m2", left_item: "Provincial photo ID", right_item: "Provincial agency" },
            { _key: "m3", left_item: "Health card", right_item: "Provincial agency" },
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
