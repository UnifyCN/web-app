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

## Launch steps

Run these only after the web screen PRs (home, course, module, lesson, activities) are merged and
deployed. The flag on its own changes nothing until those screens exist.

1. Make sure Savar's mobile build with the new Learn is released, or releasing the same day.
2. In Vercel (Production), set `NEXT_PUBLIC_LEARN_V2=true`.
3. Redeploy production. The variable is read at build time.
4. Check `/learn`, a course, a module and a lesson on production, signed in, in English and Arabic.

To roll back, remove the variable (or set it to anything else) and redeploy.
