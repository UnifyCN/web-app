-- i18n Phase 6 — cached on-demand translations for In-Lesson Help discussions.
--
-- Extends the Phase 2 `translate-content` edge function (web-owned) to the
-- discussion board: it translates a `module_discussions` question or a
-- `discussion_replies` reply into the viewer's UI language and caches the
-- result here, keyed by (source row, target lang) with a SHA-256 `source_hash`
-- of the source text so an edited body invalidates its stale translations on
-- next request. All writes go through the edge function with the service role;
-- clients only read (via the direct select grant). Deferred from Phase 3
-- because `module_discussions.id` / `discussion_replies.id` are UUIDs — hence
-- uuid FKs (unlike the bigint post/comment FKs).
--
-- Reuses the Phase 2 per-user daily quota (`translation_usage` +
-- `check_and_increment_translation_usage` / `refund_translation_request`) — no
-- new quota tables or RPCs here; discussions share the 20/day pool.

create table public.discussion_translations (
  id uuid primary key default gen_random_uuid(),
  discussion_id uuid not null references public.module_discussions(id) on delete cascade,
  lang text not null,
  translated_content text not null,
  source_lang text,
  source_hash text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (discussion_id, lang)
);
create index idx_discussion_translations_discussion on public.discussion_translations(discussion_id);

create table public.discussion_reply_translations (
  id uuid primary key default gen_random_uuid(),
  reply_id uuid not null references public.discussion_replies(id) on delete cascade,
  lang text not null,
  translated_content text not null,
  source_lang text,
  source_hash text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (reply_id, lang)
);
create index idx_discussion_reply_translations_reply on public.discussion_reply_translations(reply_id);

alter table public.discussion_translations enable row level security;
alter table public.discussion_reply_translations enable row level security;

-- Translations of board-readable content are readable by any authenticated
-- user; no insert/update policies — the service role (edge function) is the
-- only writer.
create policy "discussion_translations_select" on public.discussion_translations
  for select to authenticated using (true);
create policy "discussion_reply_translations_select" on public.discussion_reply_translations
  for select to authenticated using (true);

grant all on public.discussion_translations to service_role;
grant all on public.discussion_reply_translations to service_role;
grant select on public.discussion_translations to authenticated;
grant select on public.discussion_reply_translations to authenticated;
