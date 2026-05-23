-- Settling-in checklist — Sanity-sourced tasks + user-created custom tasks.
-- Source: CLAUDE.md schema reference.

-- ----------------------------------------------------------------------------
-- user_tasks — completion state for a Sanity-defined checklist item
-- (sanity_checklist_id references Sanity content, not a Postgres table)
-- ----------------------------------------------------------------------------
create table public.user_tasks (
  user_task_id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  sanity_checklist_id text not null,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (user_id, sanity_checklist_id)
);

create index idx_user_tasks_user on public.user_tasks(user_id);

-- ----------------------------------------------------------------------------
-- custom_checklist_tasks — tasks a user adds themselves
-- ----------------------------------------------------------------------------
create table public.custom_checklist_tasks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  priority text not null check (
    priority in ('Do now', 'Do soon', 'Explore and connect', 'Optional / later')
  ),
  title text not null,
  description text,
  completed boolean not null default false,
  completed_at timestamptz,
  created_at timestamptz not null default now()
);

create index idx_custom_tasks_user on public.custom_checklist_tasks(user_id);

-- ----------------------------------------------------------------------------
-- Row Level Security — all rows private to the owning user
-- ----------------------------------------------------------------------------
alter table public.user_tasks enable row level security;
alter table public.custom_checklist_tasks enable row level security;

create policy "user_tasks_select_own" on public.user_tasks
  for select to authenticated using (user_id = auth.uid());
create policy "user_tasks_insert_own" on public.user_tasks
  for insert to authenticated with check (user_id = auth.uid());
create policy "user_tasks_update_own" on public.user_tasks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "user_tasks_delete_own" on public.user_tasks
  for delete to authenticated using (user_id = auth.uid());

create policy "custom_tasks_select_own" on public.custom_checklist_tasks
  for select to authenticated using (user_id = auth.uid());
create policy "custom_tasks_insert_own" on public.custom_checklist_tasks
  for insert to authenticated with check (user_id = auth.uid());
create policy "custom_tasks_update_own" on public.custom_checklist_tasks
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "custom_tasks_delete_own" on public.custom_checklist_tasks
  for delete to authenticated using (user_id = auth.uid());
