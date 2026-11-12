import type { SanityBlock } from "@/types";

/*
 * Activity blocks (`lesson_activity`) in the v2 reader. Ported from the mobile
 * app's utils/lessonActivity.ts and services/progress/progressService.ts, so
 * both apps store answers in `user_activity_inputs` the same way:
 *  - one row per (user, lesson, activity block `_key`, field key), upserted on
 *    `user_id,sanity_lesson_id,activity_page_key,input_field_key`
 *  - free text under the input box `_key`, plain
 *  - questions under `q::<question _key>`, JSON-encoded (an option `value`, a
 *    list of values, or for matching the list of correctly matched pair keys)
 */

export const ACTIVITY_QUESTION_PREFIX = "q::";

export interface ActivityOption {
  _key: string;
  value: string;
  text?: SanityBlock[] | string;
  is_correct?: boolean;
  explanation?: SanityBlock[];
}

export type ActivityItem =
  | SanityBlock
  | {
      _key: string;
      _type: "small_input_box" | "mid_input_box" | "large_input_box";
      label?: string;
      placeholder?: string;
      required?: boolean;
    }
  | {
      _key: string;
      _type:
        | "multiple_choice_single"
        | "two_options_question"
        | "multiple_choice_multiple";
      question_text?: SanityBlock[];
      options: ActivityOption[];
    }
  | {
      _key: string;
      _type: "matching_question";
      question_text?: SanityBlock[];
      matching_pairs: {
        _key: string;
        left_item: string;
        right_item: string;
      }[];
    };

export type ActivityAnswers = Record<string, string | string[]>;

const INPUT_TYPES = new Set([
  "small_input_box",
  "mid_input_box",
  "large_input_box",
]);

/** Whether every required response is filled (mobile `canSubmitLessonActivity`). */
export function canSubmitLessonActivity(
  instructions: readonly ActivityItem[],
  inputs: Record<string, string>,
  answers: ActivityAnswers,
): boolean {
  return instructions.every((block) => {
    switch (block._type) {
      case "large_input_box":
      case "mid_input_box":
      case "small_input_box":
        return !block.required || Boolean(inputs[block._key]?.trim());
      case "multiple_choice_single":
      case "two_options_question": {
        const answer = answers[block._key];
        return (
          typeof answer === "string" &&
          (block.options ?? []).some((o) => o.value === answer)
        );
      }
      case "multiple_choice_multiple": {
        const answer = answers[block._key];
        return (
          Array.isArray(answer) &&
          answer.length > 0 &&
          answer.every((v) => (block.options ?? []).some((o) => o.value === v))
        );
      }
      case "matching_question": {
        const answer = answers[block._key];
        return (
          Array.isArray(answer) &&
          (block.matching_pairs ?? []).every((p) => answer.includes(p._key))
        );
      }
      default:
        return true;
    }
  });
}

/** Stored field keys of an activity's responses, and whether each is required. */
export function activityResponseKeys(
  instructions: readonly ActivityItem[],
): { key: string; required: boolean }[] {
  return instructions.flatMap((block) => {
    if (INPUT_TYPES.has(block._type)) {
      return [
        {
          key: block._key,
          required: Boolean((block as { required?: boolean }).required),
        },
      ];
    }
    switch (block._type) {
      case "multiple_choice_single":
      case "two_options_question":
      case "multiple_choice_multiple":
      case "matching_question":
        return [{ key: ACTIVITY_QUESTION_PREFIX + block._key, required: true }];
      default:
        return [];
    }
  });
}

export interface ActivityInputRow {
  activity_page_key: string;
  input_field_key: string;
  input_value: string | null;
  is_submitted?: boolean | null;
}

export interface SavedActivity {
  inputValues: Record<string, string>;
  questionAnswers: ActivityAnswers;
  submittedFields: Record<string, boolean>;
  isSubmitted: boolean;
}

/** Group a lesson's stored rows by activity block, decoding question answers. */
export function groupActivityInputs(
  rows: readonly ActivityInputRow[],
): Record<string, SavedActivity> {
  const byPage: Record<string, SavedActivity> = {};
  for (const row of rows) {
    const page = (byPage[row.activity_page_key] ??= {
      inputValues: {},
      questionAnswers: {},
      submittedFields: {},
      isSubmitted: false,
    });
    const submitted = Boolean(row.is_submitted);
    page.submittedFields[row.input_field_key] = submitted;
    page.isSubmitted ||= submitted;
    if (row.input_field_key.startsWith(ACTIVITY_QUESTION_PREFIX)) {
      const key = row.input_field_key.slice(ACTIVITY_QUESTION_PREFIX.length);
      try {
        page.questionAnswers[key] = JSON.parse(row.input_value ?? "null");
      } catch {
        // A malformed answer is treated as unanswered.
      }
    } else {
      page.inputValues[row.input_field_key] = row.input_value ?? "";
    }
  }
  return byPage;
}

/** Whether a stored activity counts as submitted (every required response,
 * and every saved one, submitted), so a returning learner can continue. */
export function isActivityComplete(
  instructions: readonly ActivityItem[],
  saved: SavedActivity | undefined,
): boolean {
  if (!saved?.isSubmitted) return false;
  const fully = activityResponseKeys(instructions).every(({ key, required }) =>
    key in saved.submittedFields ? saved.submittedFields[key] : !required,
  );
  return (
    fully &&
    canSubmitLessonActivity(
      instructions,
      saved.inputValues,
      saved.questionAnswers,
    )
  );
}

/** The upsert body for one activity field (mobile `saveActivityInput`). A
 * draft clears `is_submitted`; only a submit sets it. */
export function buildActivityInput(
  ids: { lessonId: string; submoduleId: string; moduleId: string },
  activityKey: string,
  fieldKey: string,
  value: string,
  submitted: boolean,
  now: Date,
) {
  return {
    sanity_lesson_id: ids.lessonId,
    sanity_submodule_id: ids.submoduleId,
    sanity_module_id: ids.moduleId,
    activity_page_key: activityKey,
    input_field_key: fieldKey,
    input_value: value,
    ...(submitted
      ? { is_submitted: true, submitted_at: now.toISOString() }
      : { is_submitted: false }),
  };
}
