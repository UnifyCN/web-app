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

export const sanityClient = createClient({
  projectId: PROJECT_ID,
  dataset: DATASET,
  apiVersion: "2024-01-01",
  useCdn: true,
  perspective: "published",
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

/* ---- GROQ queries (verbatim from mobile UnifyCN/mobile-app) ----------- */

/** All modules with their submodules (light projection — no lessons). */
export const MODULES_LIST_QUERY = `*[_type == "module"] | order(title) {
  _id,
  _type,
  title,
  description,
  colorTheme { hex },
  icon,
  "submodules": *[_type == "submodule" && references(^._id)] | order(order) {
    _id,
    _type,
    title,
    description,
    order
  }
}`;

/** Single module with full submodule + lesson hierarchy. */
export const MODULE_DETAIL_QUERY = `*[_type == "module" && _id == $moduleId][0] {
  _id,
  _type,
  title,
  description,
  colorTheme { hex },
  icon,
  "submodules": *[_type == "submodule" && references(^._id)] | order(order) {
    _id,
    _type,
    title,
    description,
    order,
    "lessons": *[_type == "lesson" && references(^._id)] | order(order) {
      _id,
      _type,
      title,
      slug,
      description,
      order,
      "lesson_page_count": count(pages)
    }
  }
}`;

/** Single lesson with full body content. */
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
  ending_pages
}`;
