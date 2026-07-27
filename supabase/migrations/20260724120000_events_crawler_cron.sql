-- ############################################################################
-- ##  DO NOT APPLY YET — this file ACTIVATES the events crawler.            ##
-- ############################################################################
--
-- events-crawler support, PART 2 of 2: the weekly pg_cron schedule that POSTs the
-- events-crawler edge function. Split out of 20260722120000_events_crawler.sql
-- (PART 1, the source column) precisely so PART 1 could be applied without this.
--
-- Running this starts auto-publishing scraped events into the SHARED public.events
-- table, which the live mobile app reads. Apply ONLY after ALL of:
--   1. the first crawler run has been triggered MANUALLY (invoke the function with
--      the service-role Bearer token),
--   2. the inserted rows (source like 'crawler:%') have been inspected + approved,
--   3. Savar has signed off — this writes into shared mobile-facing data.
--
-- APPLY BY HAND in the Dashboard SQL editor (the MCP is read-only and `db push`
-- is unsafe against the drifted history). This file is version-control / reference.
--
-- Mirrors 20260619130000_news_details_crawler.sql. Requires pg_cron + pg_net and
-- the Vault secret holding the service-role key (already stored for news-crawler —
-- reused here, no new secret):
--
--     select vault.create_secret('<SERVICE_ROLE_KEY>', 'service_role_key');
--
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Idempotent: drop a prior schedule of the same name before re-creating it.
do $$
begin
  if exists (select 1 from cron.job where jobname = 'events-crawler-weekly') then
    perform cron.unschedule('events-crawler-weekly');
  end if;
end $$;

select cron.schedule(
  'events-crawler-weekly',
  '0 14 * * 1', -- Mondays 14:00 UTC (an hour after news-crawler); tunable
  $$
  do $cron$
  declare
    v_secret text;
  begin
    select decrypted_secret into v_secret
    from vault.decrypted_secrets
    where name = 'service_role_key';

    -- Without the Vault secret the Authorization header would be NULL and the call
    -- would 401. Skip with a notice instead so the cron run is a clean no-op.
    if v_secret is null then
      raise notice 'events-crawler-weekly: vault secret "service_role_key" is NULL; skipping run';
      return;
    end if;

    perform net.http_post(
      url := 'https://wrbauxutkysljmsqojts.supabase.co/functions/v1/events-crawler',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        -- btrim the secret: a trailing newline/space would make the header
        -- 'Bearer <key>\n' and 401 every run. (The function also trims.)
        'Authorization', 'Bearer ' || btrim(v_secret, E' \t\n\r')
      ),
      body := '{}'::jsonb,
      -- pg_net defaults to a 2s timeout, which this job cannot possibly meet: the
      -- crawler fetches 5 org feeds concurrently at FETCH_TIMEOUT_MS = 20s each, then
      -- runs per-event image HEAD probes and Pexels lookups before its insert/upsert
      -- work. At the default, net.http_post would record a timeout on every run while
      -- the function was still going, making the cron history useless for spotting
      -- real failures. 120s clears the observed worst case with headroom.
      timeout_milliseconds := 120000
    );
  end
  $cron$;
  $$
);

-- To undo (stop auto-publishing) without dropping anything else:
--   select cron.unschedule('events-crawler-weekly');
