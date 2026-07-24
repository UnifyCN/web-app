-- events-crawler support, PART 1 of 2: a source marker on public.events.
--
-- APPLY BY HAND in the Dashboard SQL editor (the MCP is read-only and `db push`
-- is unsafe against the drifted history). This file is version-control / reference.
-- Drives supabase/functions/events-crawler/index.ts.
--
-- SAFE TO APPLY NOW: additive + nullable, so the live mobile app is unaffected —
-- it simply ignores the new column.
--
-- PART 2 (the weekly pg_cron schedule that starts auto-publishing) lives in a
-- SEPARATE file — 20260724120000_events_crawler_cron.sql — deliberately, so this
-- one can be applied without also activating the crawler. Do not merge them back.

-- Tags crawler-inserted rows as 'crawler:<org-slug>' so they stay distinguishable
-- from Savar's manual rows (source IS NULL). Enables easy inspection and any future
-- scoped cleanup without ever touching manual rows.
alter table public.events add column if not exists source text;

-- Sanity check before trusting the crawler's in-function dedup (it relies on
-- external_link being distinct). Expect zero rows:
--   select external_link, count(*) from public.events
--   group by external_link having count(*) > 1;
