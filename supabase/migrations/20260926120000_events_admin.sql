-- Events admin: lets users with public.users.permissions = 'admin' add, edit, delete,
-- and feature events from the web app's /admin/events, and upload event cover photos.
-- Spec: UnifyCN/web-app#142 (slice #143 ships all of the feature's database changes).
--
-- APPLY BY HAND in the SQL editor — `db push` is unsafe against the drifted history.
-- (Dashboard SQL editor, or `supabase db query --linked -f <this file>`.) This file is
-- version-control / reference.
--
-- BEFORE APPLYING: run the "Step 0" live-schema queries from the PR description and
-- paste their output on the PR. If `address` (or another column the form treats as
-- optional) is NOT NULL live, note it on #142 so the form makes that field required.
-- Do not alter columns here.
--
-- AFTER APPLYING: run supabase/checks/events_admin_rls.sql once (it rolls back).
--
-- SAFE TO APPLY NOW: one helper function, three write policies on public.events, a
-- column-level UPDATE grant (section 2), one bucket, and four admin-only policies on
-- storage.objects. No column changes. The existing select policy on public.events is NOT touched. Until someone
-- has permissions = 'admin', nobody gains a new write.
--
-- Accepted side effect (spec D2): on mobile, 'admin' can also delete and pin any post.
-- Grant it only to Unify staff (runbook: docs/events-admin.md).
--
-- Re-runnable: `create or replace`, `drop policy if exists` + `create policy` on this
-- file's own policy names only, and an upsert for the bucket.

begin;

-- ----------------------------------------------------------------------------
-- 1) public.is_admin()
-- SECURITY DEFINER so policies can read public.users without depending on its RLS
-- (and without recursion if a users policy ever calls it). search_path is pinned.
-- ----------------------------------------------------------------------------
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.users
    where id = auth.uid() and permissions = 'admin'
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ----------------------------------------------------------------------------
-- 2) Table privileges for the admin writes.
-- INSERT / DELETE: defensive and idempotent. Supabase's default grants normally give
-- `authenticated` these already, in which case this is a no-op. Without them, every
-- admin write fails with 42501 before RLS is even consulted. RLS below still decides
-- which rows a user may write; with no matching policy, a non-admin still writes nothing.
--
-- UPDATE is column-level, NOT table-wide. RLS cannot compare old and new values, so a
-- table-wide UPDATE would let an admin set `source` to null on a crawler row and then
-- delete it through events_admin_delete (and the crawler re-inserts it on Monday).
-- The revoke also removes any column grants; the grant then lists exactly the columns
-- the admin form edits. `id`, `source`, `created_at` and `max_attendees` are excluded.
-- No authenticated client updates events today (there was no write policy), so the
-- revoke takes nothing away. service_role (the crawler) has its own grants.
-- ----------------------------------------------------------------------------
grant insert, delete on table public.events to authenticated;
revoke update on table public.events from authenticated;
grant update (
  title, description, event_datetime, event_end_datetime, location, address,
  event_type, hosted_by, genre, cover_photo_url, external_link,
  is_featured, partner_slug, updated_at
) on table public.events to authenticated;

-- events.id is a serial on the live table: an insert calls nextval() on its sequence.
do $$
declare
  v_seq text := pg_get_serial_sequence('public.events', 'id');
begin
  if v_seq is not null then
    execute format('grant usage, select on sequence %s to authenticated', v_seq);
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- 3) Write policies on public.events (the existing select policy stays as it is).
--    Manual rows (source is null): admins insert, update, delete.
--    Crawler rows (source like 'crawler:%'): admins update only. The UI limits that
--    update to is_featured + partner_slug (spec D5: RLS cannot restrict columns).
--    No delete: the crawler would re-insert the row on its next Monday run.
-- ----------------------------------------------------------------------------
drop policy if exists events_admin_insert on public.events;
create policy events_admin_insert on public.events
  for insert to authenticated
  with check (public.is_admin() and source is null);

drop policy if exists events_admin_update on public.events;
create policy events_admin_update on public.events
  for update to authenticated
  using (public.is_admin())
  with check (public.is_admin());

drop policy if exists events_admin_delete on public.events;
create policy events_admin_delete on public.events
  for delete to authenticated
  using (public.is_admin() and source is null);

-- ----------------------------------------------------------------------------
-- 4) Bucket for cover photos. PUBLIC, because events.cover_photo_url must be a
--    permanent URL the anonymous landing page can render (spec D7). 5 MB limit,
--    JPEG / PNG / WebP only. Objects live at event-covers/<uuid>.<ext>.
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('event-covers', 'event-covers', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do update set public = excluded.public,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- ----------------------------------------------------------------------------
-- 5) Admin-only writes on storage.objects for the bucket. Public read comes from the
--    bucket being public (public URLs do not go through RLS).
-- ----------------------------------------------------------------------------
drop policy if exists event_covers_admin_insert on storage.objects;
create policy event_covers_admin_insert on storage.objects
  for insert to authenticated
  with check (bucket_id = 'event-covers' and public.is_admin());

drop policy if exists event_covers_admin_update on storage.objects;
create policy event_covers_admin_update on storage.objects
  for update to authenticated
  using (bucket_id = 'event-covers' and public.is_admin())
  with check (bucket_id = 'event-covers' and public.is_admin());

drop policy if exists event_covers_admin_delete on storage.objects;
create policy event_covers_admin_delete on storage.objects
  for delete to authenticated
  using (bucket_id = 'event-covers' and public.is_admin());

-- Admin-only SELECT through the API (not needed for public URLs). Added beyond the
-- spec's list: the Storage API's remove() and upsert paths read the object row under
-- RLS, so without it the "delete the old cover" cleanup in later slices can silently
-- remove nothing. It is limited to admins, so it does not let anyone list the bucket.
drop policy if exists event_covers_admin_select on storage.objects;
create policy event_covers_admin_select on storage.objects
  for select to authenticated
  using (bucket_id = 'event-covers' and public.is_admin());

commit;
