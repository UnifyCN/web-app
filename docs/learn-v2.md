# Learn v2 ("Courses" redesign)

The Learn redesign from Savar's Figma, matching the mobile build (mobile PRs #334, #313, #353, #356 and
#347). It is built behind a flag and launches together with the mobile release.

## Flag

`NEXT_PUBLIC_LEARN_V2`: on only when it is exactly `"true"` (`lib/learn/v2/flag.ts`). With the flag
unset, the current Learn runs unchanged. The value is inlined at build time, so a change needs a
redeploy.

## Data

- **Content:** lessons play their Sanity `content_blocks` in array order, one step per block
  (`lib/learn/v2/contentBlocks.ts`, a port of mobile's `withOrderedLessonBlocks`).
- **Progress:** progress uses the shared `user_lesson_progress` row with the mobile semantics
  (`lib/learn/v2/progress.ts`). That is the same columns and the same upsert key
  `user_id,sanity_lesson_id`, with `current_page_type` `lesson` or `quiz` and a 1-based step number.
  `total_pages` is the number of steps plus the number of quiz questions. A lesson started on web
  resumes on mobile, and the other way round.
- **Old resume positions:** an old `activity` / `ending` resume position is mapped to its block by
  `_key`.
- **Course status:** `learn_progress` turns `completed` once every lesson in the course is complete, and
  never goes back.
- **Province:** targeting is unchanged. The `[moduleId]` layout guard and `getModules` apply it.
- **Database and Sanity:** no database or Sanity changes are needed.

## Screens

| Route | Screen | Figma |
|---|---|---|
| `/learn` | Learn home: heading, Continue learning card, Courses list (All / Started, %) | 160:1198 |
| `/learn/[moduleId]` | Course (Sanity `module`): modules as numbered cards | 160:1109 |
| `/learn/[moduleId]/[submoduleId]` | Module (Sanity `submodule`): lessons as done / up next / to do, Practice | 160:1021 |
| `/learn/[moduleId]/[submoduleId]/[lessonId]?step=N` | Lesson reader: one step per content block; activities; Quick Check at `?quiz=` | 160:889 |

Each route keeps its current page behind the flag in the same file, so turning the flag off restores
today's Learn exactly. No URLs change.

## Parity with mobile (checked 2026-11-13 against mobile `origin/main` 8aef964b)

| Area | Result |
|---|---|
| Progress written to `user_lesson_progress` | Match: same columns, values, upsert key, `lesson` / `quiz` page types and `total_pages` (steps + quiz questions). |
| Lesson block ordering | Match: `content_blocks` array order, one step per block. Translations use mobile's merge (`lib/learn/v2/i18nMerge.ts`, copied byte for byte), so a translation can't reorder or re-key blocks. Fixed in this PR; it used a shallow overlay before. |
| Resume after leaving mid-lesson | Match: position saved when a step opens, `isResumable` the same, old `activity` / `ending` positions mapped by block key (`getOrderedLegacyPageNumber`). |
| Activity answers and revisit | Match: `user_activity_inputs`, same 4-column key, `q::` + JSON answers, drafts clear `is_submitted`, submit sets it, same rule for reopening Next. |
| Quiz resume | Position matches: saved per question as page type `quiz` with the quiz id and question number (fixed in this PR). Answers differ, see below. |
| Course / module completion | Match: a lesson completes after its last step or its quiz, waiting for the save (fixed in this PR); `learn_progress` turns `completed` by the same rule and never goes back. |
| Province filtering | Match: same rule (`lib/province.ts` is mobile's file); lists, resume cards and course routes filtered. |
| Sign-out | Web clears more, see below. |
| Sections per lesson | Match: same section types, Quick check not in the pills, FAQs closed with one open, same `lessonPresentation`. |

### Intentional web-only differences (for Savar)

None of these change what is written for progress, the lesson order, or any key mobile reads.

- **Quick Check answers** stay in web's own `user_lesson_quiz_progress` (the web quiz UI predates
  Learn v2). Mobile keeps them in `user_quiz_attempts` / `user_quiz_responses`, so answers
  given in a quiz don't move between apps. The quiz position and lesson completion are shared,
  and a web user resuming a quiz started on mobile opens at the saved question.
- **Unknown section types** are hidden on web (mobile shows an empty pill), and a step whose
  sections are all unknown shows its older lesson text. Display only.
- **Percentages:** Learn home shows completed lessons out of all lessons per course (Figma;
  mobile shows a status label), and the resume card uses the stored `progress_percent`.
  Display only.
- **Sign-out** removes Learn progress and activity answers from the web cache on every sign-out
  path (mobile resets its cache when the user changes). Device-local only.
- **Failure states:** a failed load or save shows a retry (progress, saved answers, quiz,
  completion) instead of showing 0% or an empty form. Display only.

## Launch steps

Prerequisites: all Learn v2 PRs (#199, #200 and the course, module, lesson, activity and launch
PRs) are merged and deployed to production, and Savar confirms the mobile build with the new Learn
is in the stores (or releasing the same day).

1. In Vercel, open the web-app project, then Settings > Environment Variables.
2. Add `NEXT_PUBLIC_LEARN_V2` with value `true`, scoped to **Production** only (also Preview if
   you want previews to show it). Exactly `true`, lowercase; any other value keeps it off.
3. Redeploy production (Deployments > latest production > Redeploy). The build cache can stay on;
   the variable is inlined at build time, so it has no effect until a new build.
4. On production, signed in, check `/learn`, a course, a module, a lesson with sections, an
   activity (submit it) and a lesson with a Quick Check, in English and in Arabic (RTL).
5. Open the same lesson on the mobile build: it resumes at the same step (shared
   `user_lesson_progress`).

**Rollback:** delete the variable (or set it to anything but `true`) and redeploy. Progress written
while it was on stays valid for both the old web Learn and mobile.

## QA record (2026-11-12)

Flag on, mocked profile, real Sanity content: home, course, module, lesson, activity and submitted
activity at 1440 and 375 in en, fr-CA, vi, es, hi, pa and ar (84 screens): no page errors, no
untranslated keys, no horizontal overflow, `lang`/`dir` correct (Arabic RTL).
