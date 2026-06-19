-- news-crawler support: dedupe key + weekly pg_cron schedule.
--
-- Apply via the Supabase Dashboard SQL editor (shared prod DB `wrbauxutkysljmsqojts`;
-- the MCP is read-only and `db push` is unsafe against the drifted history).
-- Drives supabase/functions/news-crawler/index.ts.

-- 1) Dedupe key ------------------------------------------------------------
-- The crawler upserts with ON CONFLICT (link) DO NOTHING, which requires a
-- unique index on `link`. A full (non-partial) unique index is needed so the
-- upsert's conflict target can infer it; NULLs stay distinct in Postgres, so
-- legacy/internal rows without a source link are unaffected.
create unique index if not exists news_details_link_key
  on public.news_details (link);

-- 2) Weekly schedule (Mondays 13:00 UTC) -----------------------------------
-- Requires the pg_cron + pg_net extensions and a Vault secret holding the
-- project service-role key. The service-role key is NEVER hardcoded here —
-- store it in Vault ONCE in the dashboard first:
--
--     select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
-- (rotate later via vault.update_secret). The crawler authorizes the request
-- by matching this Bearer token against SUPABASE_SERVICE_ROLE_KEY.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop a prior schedule of the same name before re-creating it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'news-crawler-weekly') then
    perform cron.unschedule('news-crawler-weekly');
  end if;
end $$;

select cron.schedule(
  'news-crawler-weekly',
  '0 13 * * 1',
  $$
  select net.http_post(
    url := 'https://wrbauxutkysljmsqojts.supabase.co/functions/v1/news-crawler',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization',
      'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'service_role_key'
      )
    ),
    body := '{}'::jsonb
  );
  $$
);
