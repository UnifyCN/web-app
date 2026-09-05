-- Cover-Letter Generator — persistence + daily quota.
--
-- A standalone sibling of the Resume Builder (20260825120000_resume_persistence),
-- cloned 1:1: `cover_letters` holds one row per letter (the `CoverLetterDraft`
-- shape from types/coverLetter.ts) — the letter body + coaching transcript as
-- JSONB, fully own-row RLS'd — and `cover_letter_usage` + the check/refund RPCs
-- mirror the resume quota pair (which mirrors the translation/chatbot quotas):
-- one row per user, UTC day rollover inside the RPC, service-role-only (the
-- cover-letter-chat edge function is the sole caller).
--
-- Draft/message ids are client-assigned UUIDs (crypto.randomUUID) so optimistic
-- create works; `id` is the PK and the client supplies it on upsert.
--
-- SHARED-DB CHANGE — NOT YET APPLIED TO PROD. Apply by hand via the dashboard SQL
-- editor (db push is unsafe on the drifted shared history), and only after
-- Savar's sign-off (shared infra). This file is the committed record; it has been
-- verified against a LOCAL supabase stack only.

create table public.cover_letters (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  title text not null default '',
  cover_letter jsonb not null,
  messages jsonb not null default '[]'::jsonb,
  complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_cover_letters_user_updated
  on public.cover_letters(user_id, updated_at desc);

alter table public.cover_letters enable row level security;

create policy "cover_letters_select_own" on public.cover_letters
  for select to authenticated using (user_id = auth.uid());
create policy "cover_letters_insert_own" on public.cover_letters
  for insert to authenticated with check (user_id = auth.uid());
create policy "cover_letters_update_own" on public.cover_letters
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "cover_letters_delete_own" on public.cover_letters
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.cover_letters to authenticated;
grant all on public.cover_letters to service_role;

-- Per-user daily message quota (COVER_LETTER_DAILY_MESSAGE_LIMIT = 30). Only the
-- cover-letter-chat edge function writes it; the select-own policy lets the UI
-- surface "N messages left today".
create table public.cover_letter_usage (
  user_id uuid primary key references public.users(id) on delete cascade,
  message_count integer not null default 0,
  last_message_at timestamptz
);

alter table public.cover_letter_usage enable row level security;

create policy "cover_letter_usage_select_own" on public.cover_letter_usage
  for select to authenticated using (user_id = auth.uid());

grant all on public.cover_letter_usage to service_role;
grant select on public.cover_letter_usage to authenticated;

-- Atomic check + increment with day rollover pinned to UTC (so the reset never
-- disagrees with the client's UTC "messages left" read under a stray session
-- timezone); returns false (and undoes the increment) once over the daily limit.
create or replace function public.check_and_increment_cover_letter_usage(
  p_user_id uuid,
  p_daily_limit integer default 30
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today_count integer;
begin
  insert into public.cover_letter_usage (user_id, message_count, last_message_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update set
    message_count = case
      when (cover_letter_usage.last_message_at at time zone 'UTC')::date
             = (now() at time zone 'UTC')::date
        then cover_letter_usage.message_count + 1
      else 1
    end,
    last_message_at = now()
  returning message_count into v_today_count;

  if v_today_count > p_daily_limit then
    update public.cover_letter_usage
      set message_count = message_count - 1
      where user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

-- Give back a consumed message when generation failed (LLM error), so a flaky
-- upstream doesn't eat the user's quota. Idempotent floor at 0, same-day only.
create or replace function public.refund_cover_letter_message(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.cover_letter_usage
    set message_count = greatest(message_count - 1, 0)
    where user_id = p_user_id
      and (last_message_at at time zone 'UTC')::date = (now() at time zone 'UTC')::date;
end;
$$;

-- Service-role-only RPCs (the cover-letter-chat edge function is the sole caller).
revoke execute on function public.check_and_increment_cover_letter_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_cover_letter_message(uuid) from public, anon, authenticated;
grant execute on function public.check_and_increment_cover_letter_usage(uuid, integer) to service_role;
grant execute on function public.refund_cover_letter_message(uuid) to service_role;
