import { createClient } from "@sanity/client";
import { createImageUrlBuilder } from "@sanity/image-url";
import type { SanityImage } from "@/types";

/**
 * Sanity client + helpers for the Learn section. The project/dataset are
 * shared with the Unify mobile app (project `fercgabp`, dataset
 * `production`). Content is publicly readable, so no auth is needed for
 * queries.
 */

const PROJECT_ID = process.env.NEXT_PUBLIC_SANITY_PROJECT_ID ?? "placeholder";
const DATASET = process.env.NEXT_PUBLIC_SANITY_DATASET ?? "production";

export function isSanityConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SANITY_PROJECT_ID &&
      process.env.NEXT_PUBLIC_SANITY_PROJECT_ID !== "placeholder",
  );
}

/**
 * DEV-ONLY draft preview: with `NEXT_PUBLIC_SANITY_PREVIEW_DRAFTS=true` (+ a
 * read token) in `.env.local`, the client reads the `drafts` perspective so
 * unpublished translation drafts render locally for visual review. Hard-gated
 * on NODE_ENV=development — production builds always read `published`.
 * The token is exposed to the local browser context; never set these vars
 * outside local dev.
 */
const PREVIEW_DRAFTS =
  process.env.NODE_ENV === "development" &&
  process.env.NEXT_PUBLIC_SANITY_PREVIEW_DRAFTS === "true";

export const sanityClient = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: "2024-01-01",
  useCdn: !PREVIEW_DRAFTS,
  perspective: PREVIEW_DRAFTS ? "drafts" : "published",
  token: PREVIEW_DRAFTS
    ? process.env.NEXT_PUBLIC_SANITY_PREVIEW_TOKEN
    : undefined,
});

const imageBuilder = createImageUrlBuilder(sanityClient);

/**
 * Build a CDN URL for a Sanity image asset. Returns `null` when the image
 * is missing or unresolvable (so callers can decide on a fallback).
 */
export function sanityImageUrl(
  image: SanityImage | null | undefined,
  opts?: { width?: number; height?: number },
): string | null {
  if (!image || !image.asset?._ref) return null;
  try {
    let builder = imageBuilder.image(image);
    if (opts?.width) builder = builder.width(opts.width);
    if (opts?.height) builder = builder.height(opts.height);
    return builder.auto("format").url();
  } catch {
    return null;
  }
}

/* ---- Language overlay (document-internationalization) ------------------ */

/**
 * Learn/Checklist content lives in per-language Sanity documents linked by
 * `translation.metadata` groups (base docs carry `language: "en"`). Queries
 * ALWAYS return the base English document — its `_id` is the stable key for
 * Supabase progress tables (shared with mobile), quiz/practice `_ref` filters
 * and `/learn/{id}` routes — plus an `i18n` object holding the translated
 * content fields, resolved through the metadata group for `$lang`.
 *
 * While a translation is an unpublished draft, the weak-reference deref
 * returns null under this client's `perspective: "published"`, so the overlay
 * is empty and English renders — i.e. translated content activates the moment
 * a translation is published, with no code change.
 */

/** GROQ fragment: translated variant of the enclosing doc for `$lang`
 * (null for English or when no published translation exists). `fields` is a
 * projection body, e.g. `title, description`. */
const i18nOverlay = (fields: string) =>
  `"i18n": select($lang != "en" => *[_type == "translation.metadata" && references(^._id)][0].translations[_key == $lang][0].value->{ ${fields} }, null)`;

/** Base-language guard for type-scoped listings. Without it, published
 * translations (separate docs referencing the same parents) would appear as
 * duplicate entries. `!defined` keeps legacy/untagged docs visible, matching
 * the Studio structure filter. */
const BASE_LANG = `(language == "en" || !defined(language))`;

/** A Sanity row that may carry a translated-content overlay. */
export type WithI18n<T> = T & { i18n?: Partial<T> | null };

/**
 * Merge a row's `i18n` overlay over its base fields (nulls in the overlay are
 * ignored so partial translations fall back per-field), dropping the `i18n`
 * key. No-op for English/missing overlays.
 */
export function mergeI18nOverlay<T extends object>(row: WithI18n<T>): T {
  const { i18n, ...base } = row;
  if (!i18n) return base as unknown as T;
  const overlay = Object.fromEntries(
    Object.entries(i18n).filter(([, v]) => v !== null && v !== undefined),
  ) as Partial<T>;
  return { ...(base as unknown as T), ...overlay };
}

/* ---- GROQ queries (mobile-derived + web language overlay) -------------- */

/** All modules with their submodules + per-submodule lesson stubs (id +
 * title + order). Used to compute progress percent client-side and to
 * resolve the first-incomplete lesson's submodule for resume cards.
 * Params: `$lang`. */
export const MODULES_LIST_QUERY = `*[_type == "module" && ${BASE_LANG}] | order(title) {
  _id,
  _type,
  _createdAt,
  title,
  description,
  colorTheme { hex },
  icon,
  "personas": coalesce(personas, []),
  "interests": coalesce(interests, []),
  ${i18nOverlay("title, description")},
  "submodules": *[_type == "submodule" && references(^._id) && ${BASE_LANG}] | order(order) {
    _id,
    _type,
    title,
    description,
    order,
    ${i18nOverlay("title, description")},
    "lessons": *[_type == "lesson" && references(^._id) && ${BASE_LANG}] | order(order) {
      _id,
      _type,
      title,
      order,
      ${i18nOverlay("title")}
    }
  }
}`;

/** Single module with full submodule + lesson hierarchy. Params: `$moduleId`,
 * `$lang`. (Lesson `pages`/`ending_pages` stay base-language here — they feed
 * page COUNTS and resume positions, which translations preserve; full lesson
 * content is overlaid in LESSON_DETAIL_QUERY.) */
export const MODULE_DETAIL_QUERY = `*[_type == "module" && _id == $moduleId][0] {
  _id,
  _type,
  _createdAt,
  title,
  description,
  colorTheme { hex },
  icon,
  "personas": coalesce(personas, []),
  "interests": coalesce(interests, []),
  ${i18nOverlay("title, description")},
  "submodules": *[_type == "submodule" && references(^._id) && ${BASE_LANG}] | order(order) {
    _id,
    _type,
    title,
    description,
    order,
    "practice_count": count(*[_type == "practice" && submodule._ref == ^._id && ${BASE_LANG}]),
    ${i18nOverlay("title, description")},
    "lessons": *[_type == "lesson" && references(^._id) && ${BASE_LANG}] | order(order) {
      _id,
      _type,
      title,
      slug,
      description,
      order,
      "lesson_page_count": count(pages),
      pages,
      ending_pages,
      ${i18nOverlay("title, description")}
    }
  }
}`;

/** Single lesson with full body content. Params: `$lessonId`, `$lang`. */
export const LESSON_DETAIL_QUERY = `*[_type == "lesson" && _id == $lessonId][0] {
  _id,
  _type,
  title,
  slug,
  description,
  submodule,
  order,
  pages,
  activity_pages,
  ending_pages,
  ${i18nOverlay("title, description, pages, activity_pages, ending_pages")}
}`;

/** Projection for a quiz-shaped `questions[]` array. `practice` and `quiz`
 * documents share the question object, so the same renderers apply — and both
 * the base projection and the `i18nOverlay` reuse this, so a translated variant
 * comes back with the same fields AND the same ordering. (`flattenPractices`
 * relies on the GROQ order for questions.) */
const QUIZ_QUESTION_FIELDS = `questions[] | order(order_number asc) {
    _key,
    question_type,
    question_text,
    options[] { _key, text, value, is_correct, explanation },
    matching_pairs[] { _key, left_item, right_item, explanation },
    correct_answer { value, explanation, points },
    order_number,
    answer_box { content, showAfterSubmit }
  }`;

/** Projection for an activity practice's `pages[]`. Same reuse rationale as
 * `QUIZ_QUESTION_FIELDS`. */
const PRACTICE_PAGE_FIELDS = `pages[] | order(order asc) {
    _key,
    title,
    order,
    answer_box { content, showAfterSubmit },
    instructions[] {
      ...,
      options[] { _key, text, value, is_correct, explanation },
      matching_pairs[] { _key, left_item, right_item, explanation }
    }
  }`;

/** All practices for a submodule (quiz + activity), ordered. The caller
 * filters to quiz-type. Mirrors the mobile practices query. Params:
 * `$submoduleId`, `$lang`. A translated practice carries its own `submodule`
 * ref pointing at the same (English) submodule, so without `BASE_LANG` this
 * listing would return one row per language. */
export const PRACTICES_BY_SUBMODULE_QUERY = `*[_type == "practice" && submodule._ref == $submoduleId && ${BASE_LANG}] | order(order_number asc) {
  _id,
  _type,
  title,
  description,
  practice_type,
  order_number,
  "submodule": submodule-> { _id, title },
  ${QUIZ_QUESTION_FIELDS},
  ${PRACTICE_PAGE_FIELDS},
  ${i18nOverlay(`title, description, ${QUIZ_QUESTION_FIELDS}, ${PRACTICE_PAGE_FIELDS}`)}
}`;

/** Lesson-level "Quick Check" quizzes for a lesson, ordered. Questions share
 * the practice question shape, so the same renderers apply. Params:
 * `$lessonId`, `$lang` (see PRACTICES_BY_SUBMODULE_QUERY on `BASE_LANG`). */
export const LESSON_QUIZ_QUERY = `*[_type == "quiz" && lesson._ref == $lessonId && ${BASE_LANG}] | order(order_number asc) {
  _id,
  _type,
  title,
  description,
  order_number,
  ${QUIZ_QUESTION_FIELDS},
  ${i18nOverlay(`title, description, ${QUIZ_QUESTION_FIELDS}`)}
}`;
