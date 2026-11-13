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

## Launch steps

Prerequisites: all Learn v2 PRs (#199, #200 and the course, module, lesson, activity and launch
PRs) are merged and deployed to production, and Savar confirms the mobile build with the new Learn
is in the stores (or releasing the same day).

1. In Vercel, open the web-app project, then Settings > Environment Variables.
2. Add `NEXT_PUBLIC_LEARN_V2` with value `true`, scoped to **Production** only (also Preview if
   you want previews to show it). Exactly `true`, lowercase; any other value keeps it off.
3. Redeploy production (Deployments > latest production > Redeploy, without build cache not
   needed). The variable is inlined at build time, so it has no effect until a new build.
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
