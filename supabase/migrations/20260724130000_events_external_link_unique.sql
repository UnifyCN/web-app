-- events: unique external_link, so duplicate rows are impossible at the DB level.
--
-- APPLY BY HAND in the Dashboard SQL editor (the MCP is read-only and `db push`
-- is unsafe against the drifted history). This file is version-control / reference.
--
-- SAFE TO APPLY NOW, and independent of the crawler gate. This only *prevents*
-- duplicates — it publishes nothing and triggers nothing. Do NOT confuse it with
-- 20260724120000_events_crawler_cron.sql, which is deliberately held back until
-- manual inspection + Savar sign-off.
--
-- Why: events-crawler dedupes by reading existing links and filtering in-function
-- (supabase/functions/events-crawler/index.ts). That read-then-insert has a real
-- race window — a manual trigger overlapping the weekly cron could have both runs
-- pass the "link doesn't exist yet" check and insert the same event twice. The
-- index below closes it; the function now upserts with ignoreDuplicates so a lost
-- race is a silent no-op instead of a 23505.

-- 1) INSPECT — review this BEFORE running step 2. Returns 0 rows as of 2026-07-24
--    (17 rows, 17 distinct links), so step 2 should be a no-op.
--
--   select external_link, count(*), array_agg(id order by id)
--   from public.events
--   group by external_link having count(*) > 1;

-- 2) RESOLVE any duplicates, keeping the earliest row per link.
--    No-op on the current data. Safe: nothing references public.events by foreign
--    key, so removing a row cannot cascade. Only run after reviewing step 1's output.
delete from public.events e
using (
  select external_link, min(id) as keep_id
  from public.events
  where external_link is not null
  group by external_link
  having count(*) > 1
) dup
where e.external_link = dup.external_link
  and e.id <> dup.keep_id;

-- 3) CONSTRAIN.
--    Deliberately a FULL (non-partial) unique index, not `where external_link is not
--    null`, for two reasons: external_link is NOT NULL on this table, so a partial
--    predicate would cover every row anyway; and a partial unique index cannot be
--    inferred by `on conflict (external_link) do nothing` — Postgres requires the
--    conflict clause to repeat the index predicate, which PostgREST/supabase-js
--    cannot emit, so the upsert would fail outright. NULLs stay distinct in Postgres
--    regardless, so link-less rows would be unaffected even if the column were
--    nullable. Same reasoning as news_details_link_key in
--    20260619130000_news_details_crawler.sql.
create unique index if not exists events_external_link_key
  on public.events (external_link);
