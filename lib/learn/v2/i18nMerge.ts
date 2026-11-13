/*
 * Translation merge for Learn v2 lessons. Copied from the mobile app's
 * services/sanity/i18n.ts (mergeTranslatedValue and helpers, origin/main
 * 8aef964b) so a translated lesson keeps the same block order, keys and
 * response structure as English on both apps: progress, saved answers,
 * highlights and resume positions are keyed by them. Keep it identical to
 * mobile's; if mobile changes it, copy it over.
 *
 * Only lessons use this. The rest of the app keeps lib/sanity.ts's shallow
 * `mergeI18nOverlay` for titles and descriptions.
 */

type WithI18nRow<T> = T & {
  i18n?: { [Key in keyof T]?: T[Key] | null } | null;
};

const IDENTITY_FIELDS = new Set(["_id", "_type", "_key"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function isKeyedItem(value: unknown): value is Record<string, unknown> & {
  _key: string;
} {
  return isRecord(value) && typeof value._key === "string";
}

type Annotation = Record<string, unknown> & { _key: string; _type: string };

const TEXT_DECORATORS = new Set([
  "strong",
  "em",
  "code",
  "underline",
  "strike-through",
]);

function isAnnotation(value: unknown): value is Annotation {
  return (
    isKeyedItem(value) &&
    typeof value._type === "string" &&
    (value._type !== "link" ||
      (typeof value.href === "string" && value.href.length > 0))
  );
}

function mergeAnnotations(base: unknown, translated: unknown): Annotation[] {
  const definitions = new Map<string, Annotation>();
  if (Array.isArray(base))
    for (const definition of base.filter(isAnnotation))
      definitions.set(definition._key, definition);
  if (Array.isArray(translated) && translated.every(isAnnotation)) {
    for (const definition of translated)
      definitions.set(definition._key, definition);
  }
  return [...definitions.values()];
}

function hasTranslatedSpans(
  block: Record<string, unknown>,
  annotations: Annotation[],
): boolean {
  const children = block.children;
  const annotationKeys = new Set(
    annotations.map((definition) => definition._key),
  );
  return (
    Array.isArray(children) &&
    children.length > 0 &&
    children.every(
      (span) =>
        isKeyedItem(span) &&
        span._type === "span" &&
        typeof span.text === "string" &&
        (span.marks === undefined ||
          (Array.isArray(span.marks) &&
            span.marks.every(
              (mark) =>
                typeof mark === "string" &&
                (TEXT_DECORATORS.has(mark) || annotationKeys.has(mark)),
            ))),
    ) &&
    (block.markDefs === undefined ||
      (Array.isArray(block.markDefs) && block.markDefs.every(isAnnotation)))
  );
}

/**
 * Merge translated data into base content without letting a translation alter
 * page, block or response structure. Their base order and keys remain
 * authoritative for progress, saved answers and resume positions.
 * Portable Text spans and their annotations belong to the translated paragraph.
 */
function mergeTranslatedValue(
  base: unknown,
  translated: unknown,
  inheritedAnnotations: Annotation[] = [],
): unknown {
  if (translated === null || translated === undefined) return base;

  if (Array.isArray(base)) {
    if (!Array.isArray(translated)) return base;
    if (base.every(isKeyedItem)) {
      const translatedByKey = new Map(
        translated.filter(isKeyedItem).map((item) => [item._key, item]),
      );
      return base.map((item) => {
        const translatedItem = translatedByKey.get(item._key);
        return translatedItem
          ? mergeTranslatedValue(item, translatedItem, inheritedAnnotations)
          : item;
      });
    }
    return translated;
  }

  if (Array.isArray(translated)) return base;

  if (isRecord(base)) {
    if (!isRecord(translated)) return base;
    const isTextBlock = base._type === "block";
    if (isTextBlock && translated._type !== "block") return base;
    const annotations = mergeAnnotations(
      inheritedAnnotations,
      isTextBlock
        ? (translated.markDefs ?? base.markDefs)
        : mergeAnnotations(base.markDefs, translated.markDefs),
    );
    // Span keys and annotations belong to the localized paragraph. Keep them
    // together, while the paragraph and all progress identities keep base keys.
    if (isTextBlock && !hasTranslatedSpans(translated, annotations))
      return base;
    const merged: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(translated)) {
      if (IDENTITY_FIELDS.has(key) || value === null || value === undefined) {
        continue;
      }
      if (isTextBlock && (key === "children" || key === "markDefs")) continue;
      if (key === "markDefs" || key.endsWith("MarkDefs")) {
        if (Array.isArray(value) && value.every(isAnnotation))
          merged[key] = mergeAnnotations(base[key], value);
        continue;
      }
      const annotationField =
        key === "question_text" ? "questionMarkDefs" : `${key}MarkDefs`;
      const fieldAnnotations = [
        "instructions",
        "text",
        "explanation",
        "question_text",
      ].includes(key)
        ? mergeAnnotations(base[annotationField], translated[annotationField])
        : key === "answer_box"
          ? []
          : annotations;
      merged[key] = mergeTranslatedValue(base[key], value, fieldAnnotations);
    }
    if (isTextBlock) {
      merged.children = translated.children;
      merged.markDefs = translated.markDefs ?? base.markDefs;
    }
    return merged;
  }

  if (isRecord(translated)) return base;

  return translated;
}

/** Overlay translated fields while preserving all base document identities
 * (mobile `mergeI18nOverlay`). */
export function mergeTranslatedLesson<T extends object>(
  row: WithI18nRow<T>,
): T {
  const { i18n, ...base } = row;
  if (!i18n) return base as unknown as T;
  return mergeTranslatedValue(base, i18n) as T;
}
