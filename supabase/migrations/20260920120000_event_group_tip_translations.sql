-- i18n Phase 7 — cached on-demand translations for events, groups, and daily tips.
--
-- Extends the Phase 2 `translate-content` edge function (web-owned) to three
-- more sources, following the same shape as the Phase 2 / Phase 6 cache tables:
-- keyed by (source row, target lang) with a SHA-256 `source_hash` of the source
-- text so an edited row invalidates its stale translations on next request. All
-- writes go through the edge function with the service role; clients only read.
--
-- Reuses the Phase 2 per-user daily quota (`translation_usage` +
-- `check_and_increment_translation_usage` / `refund_translation_request`) — no
-- new quota tables or RPCs here; these types share the 20/day pool.
--
-- Id shapes differ per source: `events.id` and `groups.id` are integer serials
-- (the FK columns are `integer`, matching those columns exactly — the Phase 2
-- tables used `bigint` for the same kind of key, which also works but is wider
-- than the column it references); `daily_tips.id` is a uuid.
--
-- All three carry a title as well as a body, so each cache table has a
-- `translated_title` column (only `post_translations` did among the earlier
-- ones).
--
-- RLS IS NOT UNIFORM HERE — read before copying this file for a new type.
-- `events` and `groups` are world-readable ("Enable read access for all users",
-- `using (true)`), so their translations are too. `daily_tips` is NOT: its only
-- select policy is `user_id = auth.uid()`, i.e. a tip belongs to one user. A
-- `using (true)` policy on `tip_translations` would hand any authenticated
-- caller the translated text of someone else's tip, so its policy joins back to
-- the owning row. The edge function makes the matching check on the read side
-- (its service-role fetch bypasses RLS entirely).

create table public.event_translations (
  id uuid primary key default gen_random_uuid(),
  event_id integer not null references public.events(id) on delete cascade,
  lang text not null,
  translated_title text,
  translated_content text not null,
  source_lang text,
  source_hash text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (event_id, lang)
);
create index idx_event_translations_event on public.event_translations(event_id);

create table public.group_translations (
  id uuid primary key default gen_random_uuid(),
  group_id integer not null references public.groups(id) on delete cascade,
  lang text not null,
  translated_title text,
  translated_content text not null,
  source_lang text,
  source_hash text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (group_id, lang)
);
create index idx_group_translations_group on public.group_translations(group_id);

create table public.tip_translations (
  id uuid primary key default gen_random_uuid(),
  tip_id uuid not null references public.daily_tips(id) on delete cascade,
  lang text not null,
  translated_title text,
  translated_content text not null,
  source_lang text,
  source_hash text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (tip_id, lang)
);
create index idx_tip_translations_tip on public.tip_translations(tip_id);

alter table public.event_translations enable row level security;
alter table public.group_translations enable row level security;
alter table public.tip_translations enable row level security;

-- Translations of world-readable content are world-readable; no insert/update
-- policies — the service role (edge function) is the only writer.
create policy "event_translations_select" on public.event_translations
  for select to authenticated using (true);
create policy "group_translations_select" on public.group_translations
  for select to authenticated using (true);

-- A daily tip is private to its owner, so its translation is too. The index on
-- daily_tips(id) is its primary key, so this exists-check is a single lookup.
create policy "tip_translations_select_own" on public.tip_translations
  for select to authenticated using (
    exists (
      select 1
      from public.daily_tips t
      where t.id = tip_translations.tip_id
        and t.user_id = auth.uid()
    )
  );

grant all on public.event_translations to service_role;
grant all on public.group_translations to service_role;
grant all on public.tip_translations to service_role;
grant select on public.event_translations to authenticated;
grant select on public.group_translations to authenticated;
grant select on public.tip_translations to authenticated;
