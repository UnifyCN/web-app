-- Enforce one post-report per user per post.
--
-- WHY: the live `report-post` edge function's duplicate check queries a table
-- named `reports` that does NOT exist on the shared DB, so the check errors
-- silently and every report inserts a fresh row — there is no UNIQUE constraint
-- on post_report, so a user can report the same post unlimited times and each
-- insert fires a moderator email. This constraint makes the dedup enforceable at
-- the database level.
--
-- APPLY MANUALLY VIA THE SUPABASE DASHBOARD (SQL editor) against the shared
-- project `wrbauxutkysljmsqojts`. The MCP servers are read-only and `db push`
-- is unsafe against this remote history. REVIEW the DELETE below before running:
-- this is a LIVE shared DB (mobile + web) and the statement removes duplicate
-- report rows.
--
-- CROSS-APP NOTE: post_report is shared with the mobile app. After this lands, a
-- repeat report (web OR mobile) raises a 23505 unique violation instead of
-- silently inserting. The `report-post` edge function should be updated to map
-- 23505 → an "Already reported" success/no-op so both clients show a clean
-- message (tracked in BACKLOG.md). reporter_id can be NULL (ON DELETE SET NULL
-- when a reporter is deleted); UNIQUE treats NULLs as distinct, so orphaned
-- reports are never collapsed.

-- 1. De-duplicate existing rows: keep the earliest report (lowest id) for each
--    (reporter_id, post_id) pair, drop the rest. Only non-NULL pairs can ever
--    collide under the constraint, so NULL-reporter rows are left untouched.
DELETE FROM public.post_report a
USING public.post_report b
WHERE a.reporter_id IS NOT NULL
  AND a.post_id IS NOT NULL
  AND a.reporter_id = b.reporter_id
  AND a.post_id = b.post_id
  AND a.id > b.id;

-- 2. One report per (reporter, post). Wrapped so the migration is replay-safe
--    (re-running it when the constraint already exists is a no-op rather than a
--    "constraint already exists" error).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'post_report_reporter_post_unique'
      AND conrelid = 'public.post_report'::regclass
  ) THEN
    ALTER TABLE public.post_report
      ADD CONSTRAINT post_report_reporter_post_unique UNIQUE (reporter_id, post_id);
  END IF;
END; $$;
