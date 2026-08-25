-- Resume Builder — real persistence (moves off the localStorage prototype).
--
-- Two tables + a per-user daily quota, on the shared DB (Savar signed off).
-- `resume_drafts` holds one row per draft (the `ResumeDraft` shape from
-- types/resume.ts): the resume body and the coaching transcript as JSONB,
-- fully owned/CRUD'd by the user via own-row RLS (mirrors custom_checklist_tasks
-- + the companion `messages.sources` jsonb pattern). `resume_usage` + the
-- check/refund RPCs mirror the translation quota pair
-- (`check_and_increment_translation_usage` / `refund_translation_request`),
-- which itself mirrors the chatbot quota: one row per user, day rollover inside
-- the RPC, service-role-only (the resume-chat edge function is the sole caller).
--
-- Draft/message/entry ids are client-assigned UUIDs (crypto.randomUUID) so
-- optimistic create works; `id` is the PK and the client supplies it on upsert.
-- Applied by hand via the dashboard SQL editor (db push is unsafe on the drifted
-- shared history); this file is the committed record.

create table public.resume_drafts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references public.users(id) on delete cascade,
  title text not null default '',
  resume jsonb not null,
  messages jsonb not null default '[]'::jsonb,
  complete boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_resume_drafts_user_updated
  on public.resume_drafts(user_id, updated_at desc);

alter table public.resume_drafts enable row level security;

create policy "resume_drafts_select_own" on public.resume_drafts
  for select to authenticated using (user_id = auth.uid());
create policy "resume_drafts_insert_own" on public.resume_drafts
  for insert to authenticated with check (user_id = auth.uid());
create policy "resume_drafts_update_own" on public.resume_drafts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "resume_drafts_delete_own" on public.resume_drafts
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, update, delete on public.resume_drafts to authenticated;
grant all on public.resume_drafts to service_role;

-- Per-user daily message quota (RESUME_DAILY_MESSAGE_LIMIT = 60). Only the
-- resume-chat edge function writes it; the select-own policy lets the UI surface
-- "N messages left today".
create table public.resume_usage (
  user_id uuid primary key references public.users(id) on delete cascade,
  message_count integer not null default 0,
  last_message_at timestamptz
);

alter table public.resume_usage enable row level security;

create policy "resume_usage_select_own" on public.resume_usage
  for select to authenticated using (user_id = auth.uid());

grant all on public.resume_usage to service_role;
grant select on public.resume_usage to authenticated;

-- Atomic check + increment with day rollover (UTC, via current_date); returns
-- false (and undoes the increment) once the caller is over the daily limit.
create or replace function public.check_and_increment_resume_usage(
  p_user_id uuid,
  p_daily_limit integer default 60
) returns boolean
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_today_count integer;
begin
  insert into public.resume_usage (user_id, message_count, last_message_at)
  values (p_user_id, 1, now())
  on conflict (user_id) do update set
    message_count = case
      when resume_usage.last_message_at::date = current_date
        then resume_usage.message_count + 1
      else 1
    end,
    last_message_at = now()
  returning message_count into v_today_count;

  if v_today_count > p_daily_limit then
    update public.resume_usage
      set message_count = message_count - 1
      where user_id = p_user_id;
    return false;
  end if;

  return true;
end;
$$;

-- Give back a consumed message when generation failed (LLM error), so a flaky
-- upstream doesn't eat the user's quota. Idempotent floor at 0, same-day only.
create or replace function public.refund_resume_message(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  update public.resume_usage
    set message_count = greatest(message_count - 1, 0)
    where user_id = p_user_id
      and last_message_at::date = current_date;
end;
$$;

-- Service-role-only RPCs (the resume-chat edge function is the sole caller).
revoke execute on function public.check_and_increment_resume_usage(uuid, integer) from public, anon, authenticated;
revoke execute on function public.refund_resume_message(uuid) from public, anon, authenticated;
grant execute on function public.check_and_increment_resume_usage(uuid, integer) to service_role;
grant execute on function public.refund_resume_message(uuid) to service_role;
