-- i18n Phase 2 — cached on-demand translations for user-generated content.
--
-- The `translate-content` edge function (web-owned) translates a post or
-- comment into the viewer's UI language and caches the result here, keyed by
-- (source row, target lang) with a SHA-256 `source_hash` of the source text so
-- an edited post invalidates its stale translations on next request. All
-- writes go through the edge function with the service role; clients only
-- read (via the function today — the select grant keeps a direct-read path
-- open for the Phase 3 UI). `posts.id` / `post_comments.id` are integer
-- serials on the shared DB, hence bigint FKs (same as comment_likes).
--
-- Also adds the per-user daily quota (20 translations/day, cache hits free):
-- `translation_usage` + check/refund RPCs mirroring the chatbot quota pair
-- (`check_and_increment_chatbot_usage` / `refund_chatbot_message`), callable
-- by the service role only.

create table public.post_translations (
  id uuid primary key default gen_random_uuid(),
  post_id bigint not null references public.posts(id) on delete cascade,
  lang text not null,
  translated_title text,
  translated_content text not null,
  source_lang text,
  source_hash text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (post_id, lang)
);
create index idx_post_translations_post on public.post_translations(post_id);

create table public.comment_translations (
  id uuid primary key default gen_random_uuid(),
  comment_id bigint not null references public.post_comments(id) on delete cascade,
  lang text not null,
  translated_content text not null,
  source_lang text,
  source_hash text not null,
  model text,
  created_at timestamptz not null default now(),
  unique (comment_id, lang)
);
create index idx_comment_translations_comment on public.comment_translations(comment_id);

alter table public.post_translations enable row level security;
alter table public.comment_translations enable row level security;

-- Translations of world-readable content are world-readable; no insert/update
-- policies — the service role (edge function) is the only writer.
create policy "post_translations_select" on public.post_translations
  for select to authenticated using (true);
create policy "comment_translations_select" on public.comment_translations
  for select to authenticated using (true);

grant all on public.post_translations to service_role;
grant all on public.comment_translations to service_role;
grant select on public.post_translations to authenticated;
grant select on public.comment_translations to authenticated;

-- Per-user daily quota. Only the edge function touches it; the select-own
-- policy lets a future UI surface "N translations left today".
create table public.translation_usage (
  user_id uuid primary key references public.users(id) on delete cascade,
  request_count integer not null default 0,
  last_request_at timestamptz
);

alter table public.translation_usage enable row level security;

create policy "translation_usage_select_own" on public.translation_usage
  for select to authenticated using (user_id = auth.uid());

grant all on public.translation_usage to service_role;
grant select on public.translation_usage to authenticated;

-- Atomic check + increment with day rollover; returns false (and undoes the
-- increment) once the caller is over the daily limit.
create or replace function public.check_and_increment_translation_usage(
  p_user_id uuid,
  p_daily_limit integer default 20
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today_count integer;
begin
  insert into public.translation_usage (user_id, request_count, last_request_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update set
    request_count = case
      when translation_usage.last_request_at::date = current_date
        then translation_usage.request_count + 1
      else 1
    end,
    last_request_at = now()
  returning request_count into v_today_count;

  if v_today_count > p_daily_limit then
    update public.translation_usage
      set request_count = request_count - 1
      where user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

-- Give back a consumed request when the translation itself failed (LLM error),
-- so a flaky upstream doesn't eat the user's quota. Idempotent floor at 0.
create or replace function public.refund_translation_request(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.translation_usage
    set request_count = greatest(request_count - 1, 0)
    where user_id = p_user_id
      and last_request_at::date = current_date;
end;
$$;

-- Service-role-only RPCs (the edge function is the sole caller).
revoke execute on function public.check_and_increment_translation_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_translation_request(uuid) from public, anon, authenticated;
grant execute on function public.check_and_increment_translation_usage(uuid, integer) to service_role;
grant execute on function public.refund_translation_request(uuid) to service_role;
