-- events-crawler support: a source marker on public.events + a weekly pg_cron
-- schedule that POSTs the events-crawler edge function.
--
-- APPLY BY HAND in the Dashboard SQL editor (the MCP is read-only and `db push`
-- is unsafe against the drifted history). This file is version-control / reference.
-- Drives supabase/functions/events-crawler/index.ts.
--
-- IMPORTANT — the two parts are applied at DIFFERENT times:
--   • PART 1 (source column) — apply NOW. Additive + nullable, so it is safe for
--     the live mobile app, which ignores the new column.
--   • PART 2 (cron schedule) — apply ONLY AFTER the first run has been triggered
--     MANUALLY and its rows inspected + approved, AND Savar has signed off (the
--     crawler auto-publishes into the shared events table that mobile reads).

-- ============================================================================
-- PART 1 — source marker (apply now)
-- ============================================================================
-- Tags crawler-inserted rows as 'crawler:<org-slug>' so they stay distinguishable
-- from Savar's manual rows (source IS NULL). Enables easy inspection and any future
-- scoped cleanup without ever touching manual rows.
alter table public.events add column if not exists source text;

-- Sanity check before trusting the crawler's in-function dedup (it relies on
-- external_link being distinct). Expect zero rows:
--   select external_link, count(*) from public.events
--   group by external_link having count(*) > 1;

-- ============================================================================
-- PART 2 — weekly schedule (apply ONLY after manual inspection + Savar sign-off)
-- ============================================================================
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
      body := '{}'::jsonb
    );
  end
  $cron$;
  $$
);
