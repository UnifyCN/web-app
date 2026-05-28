-- learn_favourites — per-user favourite flag on Sanity modules.
-- Mobile doesn't track favourites; this is web-only. Binary (row exists or
-- not), so no UPDATE policy.

create table public.learn_favourites (
  user_id uuid not null references public.users(id) on delete cascade,
  sanity_module_id text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, sanity_module_id)
);

-- No separate index on user_id — the primary key (user_id,
-- sanity_module_id) is already a btree with user_id as its leftmost
-- column, so single-column user_id lookups use the PK index.

alter table public.learn_favourites enable row level security;

create policy "learn_favourites_select_own" on public.learn_favourites
  for select to authenticated using (user_id = auth.uid());
create policy "learn_favourites_insert_own" on public.learn_favourites
  for insert to authenticated with check (user_id = auth.uid());
create policy "learn_favourites_delete_own" on public.learn_favourites
  for delete to authenticated using (user_id = auth.uid());

grant select, insert, delete on public.learn_favourites to authenticated;
