-- Posts, comments, likes, and saves.
-- Source: CLAUDE.md schema reference + mobile back-end schema.sql (corrected).

-- ----------------------------------------------------------------------------
-- posts
-- ----------------------------------------------------------------------------
create table public.posts (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete cascade,
  group_id bigint references public.groups(id) on delete cascade,
  title text not null,
  content text not null,
  like_count integer not null default 0,
  comment_count integer not null default 0,
  is_pinned boolean not null default false,
  post_image_urls text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_posts_user on public.posts(user_id);
create index idx_posts_group on public.posts(group_id);

-- ----------------------------------------------------------------------------
-- post_comments — supports threaded replies via parent_comment_id
-- ----------------------------------------------------------------------------
create table public.post_comments (
  id bigint generated always as identity primary key,
  user_id uuid references public.users(id) on delete cascade,
  post_id bigint references public.posts(id) on delete cascade,
  content text not null,
  parent_comment_id bigint references public.post_comments(id) on delete set null,
  like_count integer not null default 0,
  created_at timestamptz not null default now()
);

create index idx_post_comments_post on public.post_comments(post_id);

-- ----------------------------------------------------------------------------
-- post_likes / post_saves
-- ----------------------------------------------------------------------------
create table public.post_likes (
  user_id uuid not null references public.users(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

create table public.post_saves (
  user_id uuid not null references public.users(id) on delete cascade,
  post_id bigint not null references public.posts(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, post_id)
);

-- ----------------------------------------------------------------------------
-- Triggers — keep posts.like_count / posts.comment_count in sync
-- ----------------------------------------------------------------------------
create or replace function public.update_post_like_count()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.posts set like_count = like_count - 1 where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_post_like_change
  after insert or delete on public.post_likes
  for each row execute function public.update_post_like_count();

create or replace function public.update_post_comment_count()
returns trigger as $$
begin
  if (tg_op = 'INSERT') then
    update public.posts set comment_count = comment_count + 1 where id = new.post_id;
    return new;
  elsif (tg_op = 'DELETE') then
    update public.posts set comment_count = comment_count - 1 where id = old.post_id;
    return old;
  end if;
  return null;
end;
$$ language plpgsql security definer;

create trigger on_post_comment_change
  after insert or delete on public.post_comments
  for each row execute function public.update_post_comment_count();

-- ----------------------------------------------------------------------------
-- Row Level Security
-- ----------------------------------------------------------------------------
alter table public.posts enable row level security;
alter table public.post_comments enable row level security;
alter table public.post_likes enable row level security;
alter table public.post_saves enable row level security;

-- posts: readable by all signed-in users; authored/edited by their owner.
create policy "posts_select" on public.posts
  for select to authenticated using (true);
create policy "posts_insert_own" on public.posts
  for insert to authenticated with check (user_id = auth.uid());
create policy "posts_update_own" on public.posts
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "posts_delete_own" on public.posts
  for delete to authenticated using (user_id = auth.uid());

-- comments: readable by all; authored/edited by their owner.
create policy "comments_select" on public.post_comments
  for select to authenticated using (true);
create policy "comments_insert_own" on public.post_comments
  for insert to authenticated with check (user_id = auth.uid());
create policy "comments_update_own" on public.post_comments
  for update to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "comments_delete_own" on public.post_comments
  for delete to authenticated using (user_id = auth.uid());

-- likes: visible to all (drives counts); a user toggles only their own.
create policy "post_likes_select" on public.post_likes
  for select to authenticated using (true);
create policy "post_likes_insert_own" on public.post_likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "post_likes_delete_own" on public.post_likes
  for delete to authenticated using (user_id = auth.uid());

-- saves: private — a user only ever sees and manages their own saves.
create policy "post_saves_select_own" on public.post_saves
  for select to authenticated using (user_id = auth.uid());
create policy "post_saves_insert_own" on public.post_saves
  for insert to authenticated with check (user_id = auth.uid());
create policy "post_saves_delete_own" on public.post_saves
  for delete to authenticated using (user_id = auth.uid());
