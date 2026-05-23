-- RPC functions called from the app (CLAUDE.md schema reference).

-- ----------------------------------------------------------------------------
-- pin_post / unpin_post — toggle is_pinned on a post the caller owns
-- ----------------------------------------------------------------------------
create or replace function public.pin_post(p_post_id bigint)
returns void as $$
  update public.posts
  set is_pinned = true
  where id = p_post_id and user_id = auth.uid();
$$ language sql security definer;

create or replace function public.unpin_post(p_post_id bigint)
returns void as $$
  update public.posts
  set is_pinned = false
  where id = p_post_id and user_id = auth.uid();
$$ language sql security definer;

-- ----------------------------------------------------------------------------
-- get_post_metadata_batch — counts + caller's like/save state for many posts
-- ----------------------------------------------------------------------------
create or replace function public.get_post_metadata_batch(p_post_ids bigint[])
returns table (
  post_id bigint,
  like_count integer,
  comment_count integer,
  save_count bigint,
  liked_by_me boolean,
  saved_by_me boolean
) as $$
  select
    p.id,
    p.like_count,
    p.comment_count,
    (select count(*) from public.post_saves s where s.post_id = p.id),
    exists (
      select 1 from public.post_likes l
      where l.post_id = p.id and l.user_id = auth.uid()
    ),
    exists (
      select 1 from public.post_saves s
      where s.post_id = p.id and s.user_id = auth.uid()
    )
  from public.posts p
  where p.id = any (p_post_ids);
$$ language sql security definer;

-- ----------------------------------------------------------------------------
-- merge_highlights — replace the caller's highlights for one lesson page
-- with the supplied set (a "merge" of the page's current selections)
-- ----------------------------------------------------------------------------
create or replace function public.merge_highlights(
  p_lesson_id text,
  p_page_key text,
  p_selected_texts text[]
)
returns void as $$
  delete from public.lesson_highlights
  where user_id = auth.uid()
    and lesson_id = p_lesson_id
    and page_key = p_page_key;

  insert into public.lesson_highlights (user_id, lesson_id, page_key, selected_text)
  select auth.uid(), p_lesson_id, p_page_key, t
  from unnest(p_selected_texts) as t;
$$ language sql security definer;
