-- events: a team-picked "featured" flag and a partner link, for the landing page's
-- /events page (Unify-Landing-Page, src/pages/events/).
--
-- APPLY BY HAND (Dashboard SQL editor, or `supabase db query --linked -f <this file>`);
-- `db push` is unsafe against the drifted history. This file is version-control / reference.
--
-- SAFE TO APPLY NOW: both columns are additive with safe defaults, so the live mobile app
-- and the web app are unaffected — neither selects them. Signed off by Savar 2026-09-25.

-- Set by hand in the Table Editor. The landing page lists featured upcoming events above
-- the partner list, whatever their host — a non-partner event can still be featured.
alter table public.events
  add column if not exists is_featured boolean not null default false;

-- Slug of the Unify partner that runs this event, or null when the host is not a partner.
-- Values are the landing page's partner slugs (Unify-Landing-Page src/lib/partners.ts),
-- which the page links to as /partners/<slug>. The crawler stamps it from
-- Source.partnerSlug (supabase/functions/events-crawler/lib/sources.ts); manual rows set
-- it by hand.
--
-- Keyed off the source, not hosted_by: hosted_by is often a department or a person
-- ("International Services for Students", "Cindy Chen"), not the organisation.
alter table public.events
  add column if not exists partner_slug text;

-- Backfill the rows the crawler has already written. Keep this list in step with the
-- partnerSlug values in lib/sources.ts.
update public.events set partner_slug = case source
    when 'crawler:sfu'              then 'sfu'
    when 'crawler:capilano'         then 'capilano-university'
    when 'crawler:burnaby-nh'       then 'burnaby-neighbourhood-house'
    when 'crawler:vpl'              then 'vancouver-public-library'
    when 'crawler:surrey-libraries' then 'surrey-libraries'
  end
where partner_slug is null
  and source in (
    'crawler:sfu', 'crawler:capilano', 'crawler:burnaby-nh',
    'crawler:vpl', 'crawler:surrey-libraries'
  );

-- The landing page's two reads: upcoming featured, and upcoming by partner.
create index if not exists events_featured_upcoming_idx
  on public.events (event_datetime) where is_featured;
create index if not exists events_partner_upcoming_idx
  on public.events (partner_slug, event_datetime) where partner_slug is not null;
