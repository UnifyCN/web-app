import { createHash } from "node:crypto";
import type {
  QuizQuestionType,
  SanityBlock,
  SanityPractice,
  SanityQuizOption,
  SanityQuizQuestion,
} from "@/types";
import fixtureJson from "../__fixtures__/reflection-section-8d642532.json";
import { flattenPractices } from "../flattenPractices";
import type { FlatQuestion } from "../PracticeQuiz";

/**
 * Test support: the original Sanity documents of one real section
 * (submodule 8d642532-1174-4c71-99a4-c2ad460d6dd7) in all seven languages.
 * Each language has three practices: a true/false question (order 2), a single
 * choice question (order 4) and the confidence check (order 5, practice
 * 4112da4b). The confidence check is a `multiple_choice_multiple` question with
 * `gradingMode: "reflection"` and three options whose `is_correct` is false.
 *
 * The file is copied unchanged from the reviewed candidate export
 * (sha256 a662bbe899110529fc2e4061f4652d3d1f7a3f853350f5041d7bf16a686d867f).
 * `FIXTURE_LINE_SHA256` holds the hash of each original export line; the
 * fixture test re-serializes every document and compares, so an edit to the
 * fixture fails loudly.
 */

export const FIXTURE_LANGS = [
  "en",
  "ar",
  "es",
  "fr-CA",
  "hi",
  "pa",
  "vi",
] as const;
export type FixtureLang = (typeof FIXTURE_LANGS)[number];

export const SECTION_ID = "8d642532-1174-4c71-99a4-c2ad460d6dd7";
export const REFLECTION_PRACTICE_BASE_ID = "4112da4b-9372-46a3-b02f-a1d18e95c454";
export const REFLECTION_QUESTION_KEY = "7cc0f58a6a9e";
export const TRUE_FALSE_QUESTION_KEY = "dd81b35834ed";
export const SINGLE_CHOICE_QUESTION_KEY = "a17405817965";
/** The three confidence options, in their original order. */
export const CONFIDENCE_OPTION_KEYS = [
  "5c922d162909",
  "5c386c6f844d",
  "7b3510fa789d",
] as const;

export const FIXTURE_LINE_SHA256: Record<string, string> = {
  "4112da4b-9372-46a3-b02f-a1d18e95c454":
    "9ac13bf5cf2effa66350586d64dc7c77cf489aca4d934d01c735113ba49d8506",
  "4112da4b-9372-46a3-b02f-a1d18e95c454-ar":
    "59c76e43a5b63529c58879e458d11f6e7b8bc17f2cd7aec34c0180b8b865494c",
  "4112da4b-9372-46a3-b02f-a1d18e95c454-es":
    "d42b6f7b6879d2099d5f16bfaac82638abb70a8d6bf7d2ad921133b95776cea0",
  "4112da4b-9372-46a3-b02f-a1d18e95c454-fr-CA":
    "59499fda9537d2b9425dad32530cf3adcb2eb08b62894779f07c96a7943ac26b",
  "4112da4b-9372-46a3-b02f-a1d18e95c454-hi":
    "e65355fe8ac5c06829dd5c373b4207680b6d27a67cb0fdd9d8109fab78cfb72f",
  "4112da4b-9372-46a3-b02f-a1d18e95c454-pa":
    "a7fbbe3cc8765cadfbfe9ef178b06ab9cd88c99e61cc99ee158c7e0035930104",
  "4112da4b-9372-46a3-b02f-a1d18e95c454-vi":
    "a4f34e800e97adabd153691348763afcf817c708bbf26c4a300c697d2cc886fc",
  "c56bfc62-4e35-428a-ad73-2f7882684957":
    "9036ab585951cf83f38a12670daa92d130c4d56f8c90d69ed4fb2d9e91c40a79",
  "c56bfc62-4e35-428a-ad73-2f7882684957-ar":
    "3d108f6010d7168b7f231dd1f8635acdb1caacd1334c2ca9fd0c9c8ec66a3035",
  "c56bfc62-4e35-428a-ad73-2f7882684957-es":
    "73b6c333ba88bf6d1b1d6fad9b1d0b9ef04cd1375ab991f1264e175027fb9b09",
  "c56bfc62-4e35-428a-ad73-2f7882684957-fr-CA":
    "252f239370b2e2ae4ff3578d634216c6ade8dd9f37e0f2072378cb0cfc9c1cb7",
  "c56bfc62-4e35-428a-ad73-2f7882684957-hi":
    "a60b2b607de50420e832a51c416f67713d3c972d89c95f868e07bd0c1cb9f03a",
  "c56bfc62-4e35-428a-ad73-2f7882684957-pa":
    "a0b4caca9228b8deafad148b7c355eaf6f3f3f47648fc0ecb5eb0fc2a4a166de",
  "c56bfc62-4e35-428a-ad73-2f7882684957-vi":
    "bf2b91426774d546a866bffcbef07c03d081541b1278ef99156e61aae1fa7982",
  "ecca3ca9-7b4a-4d22-a88d-2efc10f7d843":
    "907d51a342d9fe03767ff1577092132a635c32cff6b4477775faaa7ff662138b",
  "ecca3ca9-7b4a-4d22-a88d-2efc10f7d843-ar":
    "7dc32c6ffc9ab4285ef90c770d0e12fb3b1cfa258632abee575e9362889ffdc0",
  "ecca3ca9-7b4a-4d22-a88d-2efc10f7d843-es":
    "dc535ab2b01b8d01b318193bcda33078c10ee81c09b327e8cbe26525eafdfa90",
  "ecca3ca9-7b4a-4d22-a88d-2efc10f7d843-fr-CA":
    "9f40f89fec7f868ef6341e9b3dcc527fc6332b5c9ec3ce12b60bb03e44767b63",
  "ecca3ca9-7b4a-4d22-a88d-2efc10f7d843-hi":
    "c89f3cce394cd0e6982fec83f2434e747a4b51d06f5e63e1ab996688aecc553c",
  "ecca3ca9-7b4a-4d22-a88d-2efc10f7d843-pa":
    "7a370f2145c29f3ef66f42705faaa80f45df15cf4dde25d708cec9caf1deb8f2",
  "ecca3ca9-7b4a-4d22-a88d-2efc10f7d843-vi":
    "95b10344d8b52970a65932b07e85669eaf606c9051768f09ad1f53021c42f7a5",
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The raw documents exactly as exported. */
export const RAW_FIXTURE_DOCS: readonly unknown[] = fixtureJson;

export function lineHash(doc: unknown): string {
  return createHash("sha256").update(JSON.stringify(doc)).digest("hex");
}

/**
 * Check the parts of a document that `flattenPractices` reads (id, titles,
 * order, and each page's key, order and instruction keys and types), then build
 * the `SanityPractice` from them. Option, text and answer-box content passes
 * through untouched.
 */
function parsePractice(raw: unknown): SanityPractice {
  if (!isRecord(raw)) throw new Error("fixture: document is not an object");
  const { _id, _type, title, practice_type, order_number, pages } = raw;
  if (
    typeof _id !== "string" ||
    _type !== "practice" ||
    typeof title !== "string" ||
    (practice_type !== "quiz" && practice_type !== "activity") ||
    typeof order_number !== "number" ||
    !Array.isArray(pages)
  ) {
    throw new Error(`fixture: unexpected practice shape for ${String(_id)}`);
  }
  for (const page of pages) {
    if (
      !isRecord(page) ||
      typeof page._key !== "string" ||
      typeof page.order !== "number" ||
      !Array.isArray(page.instructions) ||
      !page.instructions.every(
        (ins) =>
          isRecord(ins) &&
          typeof ins._key === "string" &&
          typeof ins._type === "string",
      )
    ) {
      throw new Error(`fixture: unexpected page shape in ${_id}`);
    }
  }
  return {
    _id,
    _type,
    title,
    description: typeof raw.description === "string" ? raw.description : null,
    practice_type,
    order_number,
    pages,
  };
}

/** Practices of one language in the order `getPractices` returns them. */
export function practicesFor(lang: FixtureLang): SanityPractice[] {
  return RAW_FIXTURE_DOCS.filter(
    (doc) => isRecord(doc) && doc.language === lang,
  )
    .map(parsePractice)
    .sort((a, b) => a.order_number - b.order_number);
}

/** The confidence-check practice (`4112da4b`) of one language. */
export function reflectionPractice(lang: FixtureLang): SanityPractice {
  const id =
    lang === "en"
      ? REFLECTION_PRACTICE_BASE_ID
      : `${REFLECTION_PRACTICE_BASE_ID}-${lang}`;
  const found = practicesFor(lang).find((p) => p._id === id);
  if (!found) throw new Error(`fixture: missing ${id}`);
  return found;
}

export function flatFor(lang: FixtureLang): FlatQuestion[] {
  return flattenPractices(practicesFor(lang));
}

export function questionsFor(lang: FixtureLang): SanityQuizQuestion[] {
  return flatFor(lang).map((f) => f.question);
}

export function questionByKey(
  questions: readonly SanityQuizQuestion[],
  key: string,
): SanityQuizQuestion {
  const found = questions.find((q) => q._key === key);
  if (!found) throw new Error(`fixture: missing question ${key}`);
  return found;
}

/** Keys of the options marked correct in the content. */
export function correctOptionKeys(q: SanityQuizQuestion): string[] {
  return (q.options ?? []).filter((o) => o.is_correct).map((o) => o._key);
}

/** The saved answers of a learner who got both knowledge questions right and
 * picked "Not Confident" on the confidence check. */
export function correctAnswersFor(lang: FixtureLang): Record<string, string[]> {
  const qs = questionsFor(lang);
  return {
    [TRUE_FALSE_QUESTION_KEY]: correctOptionKeys(
      questionByKey(qs, TRUE_FALSE_QUESTION_KEY),
    ),
    [SINGLE_CHOICE_QUESTION_KEY]: correctOptionKeys(
      questionByKey(qs, SINGLE_CHOICE_QUESTION_KEY),
    ),
    [REFLECTION_QUESTION_KEY]: [CONFIDENCE_OPTION_KEYS[0]],
  };
}

/* ---- Synthetic builders (knowledge controls, long answers) ---------------- */

export function block(text: string): SanityBlock {
  return {
    _key: `b-${text}`,
    _type: "block",
    style: "normal",
    children: [{ _key: `s-${text}`, _type: "span", marks: [], text }],
  };
}

export function option(key: string, correct: boolean): SanityQuizOption {
  return {
    _key: key,
    text: [block(key)],
    value: key,
    is_correct: correct,
  };
}

export function makeQuestion(
  key: string,
  type: QuizQuestionType,
  extra: Partial<SanityQuizQuestion> = {},
): SanityQuizQuestion {
  return {
    _key: key,
    question_type: type,
    question_text: [block(`Question ${key}`)],
    order_number: 0,
    ...extra,
  };
}
