-- news-crawler support: dedupe key + weekly pg_cron schedule.
--
-- ALREADY APPLIED to the shared DB (`wrbauxutkysljmsqojts`) via the Dashboard SQL
-- editor — this file is kept for version-control / reference only; do not re-run
-- blindly. (The MCP is read-only and `db push` is unsafe against the drifted history.)
-- Drives supabase/functions/news-crawler/index.ts.
--
-- NOTE: the cron body's `btrim(v_secret)` hardening below is reference-only too —
-- the LIVE schedule still carries the old body, so re-run the `cron.schedule(...)`
-- block in the Dashboard SQL editor for the trim to take effect.

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
  do $cron$
  declare
    v_secret text;
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'service_role_key';

    -- Guard: without the Vault secret the Authorization header would be
    -- 'Bearer ' || NULL = NULL and the call would fail unauthorized. Skip
    -- with a notice instead so the cron run is a clean no-op.
    if v_secret is null then
      raise notice 'news-crawler-weekly: vault secret "service_role_key" is NULL; skipping run';
      return;
    end if;

    perform net.http_post(
      url := 'https://wrbauxutkysljmsqojts.supabase.co/functions/v1/news-crawler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- btrim the secret: a Vault value stored with a trailing newline/space would
        -- otherwise make the header 'Bearer <key>\n' and 401 every run. (The function
        -- also trims, but keep both ends defensive.) CodeRabbit, PR #40.
        'Authorization', 'Bearer ' || btrim(v_secret, E' \t\n\r')
      ),
      body := '{}'::jsonb
    );
  end
  $cron$;
  $$
);
