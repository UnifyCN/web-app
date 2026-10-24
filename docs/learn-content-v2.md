# Learn structured lessons (content version 2)

The web lesson reader can show a lesson page as typed sections instead of one block of Portable Text. Mobile ships the same format (UnifyCN/mobile-app#334). The Studio schema and migration are in UnifyCN/unify-sanity#19.

## Content contract

The canonical Studio source is `UnifyCN/unify-sanity`, project `fercgabp`, dataset `production`. Mobile and web read this dataset.

Each `pages[]` entry of a lesson can have three optional fields: `contentVersion: 2`, `sections`, and `readingMinutes`. Each section has a stable `_key` and an optional translated `title`. The supported section types are:

| Type | Fields |
| --- | --- |
| lessonConcept | content: Portable Text |
| lessonExample | theory, practice: Portable Text |
| lessonVisual | image with alternative text, optional content and caption |
| lessonQuickCheck | question, options with one correct answer, explanation |
| lessonFaq | items with question and Portable Text answer |
| lessonCitations | sources with title, publisher, year, and HTTP(S) URL |

The types are in `types/lessonSections.ts`.

## Web reader

`components/learn/LessonPager.tsx` uses `StructuredLessonContent` only when a page has `contentVersion === 2` and a nonempty `sections` array. Otherwise it renders `pages[].content` with `SelectableLessonContent`, as before.

- Concept text, Example tabs, Visual text, and FAQ answers render through `SelectableLessonContent`. They keep selection, highlights, Ask AI, and search highlighting.
- Example tabs, Quick check answers, and FAQ disclosure use local state. Quick checks give feedback and allow a retry. They do not write quiz progress and do not replace the scored `LessonQuiz`.
- A citation is a link only when its URL starts with `http://` or `https://`.
- Sanity omits empty arrays, so the reader treats a missing `options`, `items`, or `sources` as empty. A Visual section without an image asset renders no image. The reader skips section types that it does not know.
- The Back/Next flow, activity pages, quizzes, ending pages, and completion rules do not change.

`lib/sanity.ts` needs no change: `LESSON_DETAIL_QUERY` fetches all of `pages`. The translation overlay replaces the whole `pages` array, so a translated lesson uses its own sections, or its own legacy content when it has no sections. It never shows English sections in another language.

## Saved highlights

A saved highlight stores a block key, a word range, and the selected text. `lib/learn/highlightRange.ts` accepts a range only while the words in that range still equal the saved text (after whitespace and NFC normalization). Mobile uses the same check.

- The lesson page does not show, merge, or remove a stored highlight whose range no longer matches. The row stays in `lesson_highlights`.
- `saveHighlight` throws when a new selection does not match the block's words, and the page shows an error toast.
- Migration keeps page keys and block keys, so highlights on legacy content stay valid after the content moves into a Concept section.

## Compatibility and migration

Keep `pages[].content` as a readable projection for older mobile builds and for search, read-time, and retrieval consumers. The Studio **Sync legacy content** action writes the projection to a draft. Validation blocks publication when the projection differs from the sections.

The migration adds one Concept section with each page's unchanged content. It does not invent FAQs, answers, sources, or reading times. It keeps document IDs, references, page order, page keys, block keys, spans, links, and assets. It is idempotent, writes revision-guarded patches to disk, and does not publish. Each language document migrates from its own content.

Keep legacy content until older mobile versions are no longer supported and all retrieval and search consumers read sections.

## Rollout order

Steps 1 to 4 ran on 2026-10-24. The schema is deployed, and the migration added a Concept section to 2,227 pages in 1,087 lessons across all seven languages (386 lessons already had structured pages). A read-back export matched every lesson document, and a second dry run found no changes. Step 5 is editorial work.

1. Merge the web and mobile readers. Deploy the Studio schema.
2. Export the dataset and generate the migration patches.
3. Review the preservation checks and language exceptions.
4. Apply the reviewed migration. Read the affected documents again to verify revisions and content.
5. Edit lesson sections with content review. Keep the legacy projection synchronized.
