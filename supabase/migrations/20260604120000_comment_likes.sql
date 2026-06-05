-- comment_likes — per-user likes on a post comment.
--
-- Mirrors post_likes: a (user_id, comment_id) join table. The web computes a
-- comment's like_count and the caller's likedByMe from this table directly
-- (services/feed.ts getComments), so post_comments.like_count is left unused —
-- no trigger needed. Reads are open to authenticated (using true) so the
-- service can count every user's likes on a comment, not just its own.

create table public.comment_likes (
  user_id uuid not null references public.users(id) on delete cascade,
  comment_id bigint not null references public.post_comments(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, comment_id)
);

-- Likes are fetched by comment_id (and filtered to the caller); the PK's
-- leftmost column is user_id, so add a comment_id index for the count query.
create index idx_comment_likes_comment on public.comment_likes(comment_id);

alter table public.comment_likes enable row level security;

create policy "comment_likes_select" on public.comment_likes
  for select to authenticated using (true);
create policy "comment_likes_insert_own" on public.comment_likes
  for insert to authenticated with check (user_id = auth.uid());
create policy "comment_likes_delete_own" on public.comment_likes
  for delete to authenticated using (user_id = auth.uid());

-- API-role grants (least privilege; RLS still gates row access). Mirrors
-- 20260518100800_grants.sql — explicit per-table grants so a `drop schema
-- public cascade` rebuild restores access for this table, which is created
-- after the baseline grants migration runs. No anon grant: likes are
-- per-user and only meaningful to signed-in users.
grant all on public.comment_likes to service_role;
grant select, insert, delete on public.comment_likes to authenticated;
