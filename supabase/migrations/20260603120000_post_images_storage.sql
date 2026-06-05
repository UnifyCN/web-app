-- Phase P1 (compose post) — storage bucket for post images.
--
-- A public bucket so uploaded images resolve via `getPublicUrl` and render with
-- next/image (PostCard reads the URLs straight out of posts.post_image_urls).
-- Writes are restricted to the authenticated owner's top-level folder
-- ("<auth.uid()>/..."), mirroring the own-row pattern used across this schema
-- (e.g. posts_insert_own: `user_id = auth.uid()`).
--
-- NOTE: like the Phase 18 news seed, this migration is NOT auto-applied here
-- (the Supabase MCP is read-only and `supabase db push` is unsafe against the
-- empty remote migration-history table). Apply it via the dashboard SQL editor
-- or with DB write access. Until then, image uploads fail gracefully and
-- text-only posts keep working.

insert into storage.buckets (id, name, public)
values ('post-images', 'post-images', true)
on conflict (id) do nothing;

-- Public read — the bucket is public, but an explicit SELECT policy also lets
-- authenticated clients list objects.
create policy "post_images_select_public"
  on storage.objects for select to public
  using (bucket_id = 'post-images');

-- Authenticated users may upload only into their own "<uid>/" folder.
create policy "post_images_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may replace / remove their own objects.
create policy "post_images_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "post_images_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'post-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
