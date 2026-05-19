-- Community groups and membership.
-- Source: CLAUDE.md schema reference + mobile back-end schema.sql (corrected).

-- ----------------------------------------------------------------------------
-- groups
-- ----------------------------------------------------------------------------
create table public.groups (
  id bigint generated always as identity primary key,
  group_name varchar(100) not null unique,
  group_description text,
  member_count integer not null default 0,
  cover_photo_url text,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- group_members — many-to-many users <-> groups
-- ----------------------------------------------------------------------------
create table public.group_members (
  user_id uuid not null references public.users(id) on delete cascade,
  group_id bigint not null references public.groups(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (user_id, group_id)
);

create index idx_group_members_group on public.group_members(group_id);

-- ----------------------------------------------------------------------------
-- Trigger — keep groups.member_count in sync
-- ----------------------------------------------------------------------------
create or replace function public.update_group_member_count()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.groups set member_count = member_count + 1 where id = new.group_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.groups set member_count = member_count - 1 where id = old.group_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_group_member_change
  after insert or delete on public.group_members
  for each row execute function public.update_group_member_count();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.groups enable row level security;
alter table public.group_members enable row level security;

-- groups: readable by any signed-in user; created/edited by admins only
-- (no write policy -> writes are blocked via the API).
create policy "groups_select" on public.groups
  for select to authenticated using (true);

-- group_members: membership is visible; a user joins/leaves only as themselves.
create policy "group_members_select" on public.group_members
  for select to authenticated using (true);
create policy "group_members_insert_own" on public.group_members
  for insert to authenticated with check (user_id = auth.uid());
create policy "group_members_delete_own" on public.group_members
  for delete to authenticated using (user_id = auth.uid());
