-- Profile avatars — storage bucket for user profile pictures.
--
-- A public bucket so uploaded avatars resolve via `getPublicUrl` and the URL can
-- be stored straight on `users.profile_picture_url` and rendered by the Avatar
-- component (mirrors the post-images bucket). Writes are restricted to the
-- authenticated owner's top-level folder ("<auth.uid()>/..."), matching the
-- own-row pattern used across this schema.
--
-- NOTE: like post-images and the news seed, this migration is NOT auto-applied
-- here (the Supabase MCP is read-only and `supabase db push` is unsafe against
-- the empty remote migration-history table). Apply it via the dashboard SQL
-- editor or with DB write access. Until then, avatar uploads fail gracefully
-- and the rest of the profile keeps working.

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- Public read — the bucket is public, but an explicit SELECT policy also lets
-- authenticated clients list objects.
create policy "avatars_select_public"
  on storage.objects for select to public
  using (bucket_id = 'avatars');

-- Authenticated users may upload only into their own "<uid>/" folder.
create policy "avatars_insert_own"
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

-- Owners may replace / remove their own objects.
create policy "avatars_update_own"
  on storage.objects for update to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "avatars_delete_own"
  on storage.objects for delete to authenticated
  using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
