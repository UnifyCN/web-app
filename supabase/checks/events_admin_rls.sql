-- By-hand RLS check for supabase/migrations/20260926120000_events_admin.sql.
-- Spec: UnifyCN/web-app#142. Run ONCE in the Supabase SQL editor, after the migration.
--
-- WRITES NOTHING: every statement runs inside one transaction that ends in ROLLBACK.
--
-- BEFORE RUNNING, find-and-replace EVERY occurrence of the two placeholders below with
-- real public.users ids (the setup guard stops the script if one is left in place):
--   <ADMIN_USER_ID>  — a user with permissions = 'admin'. To find one:
--                        select id, email, permissions from public.users where permissions = 'admin';
--                      (Grant yourself first if there is none: see docs/events-admin.md.)
--   <NORMAL_USER_ID> — any user whose permissions is NOT 'admin':
--                        select id, email, permissions from public.users where permissions = 'user' limit 5;
--
-- RESULT: if every check passes, the last result is one row that says
-- "events_admin_rls: all 12 checks passed". If a check fails, the script stops with an
-- ERROR whose text starts with "FAIL" and names the check. Either way nothing is saved.
--
-- What it proves:
--   (a) the admin can insert, update, and delete a manual row (source is null);
--       can feature a crawler row; cannot delete a crawler row; cannot insert a
--       row with a source.
--   (b) the normal user cannot insert, update, or delete a manual row, and cannot
--       feature a crawler row.

begin;

-- 0) Fixtures, inserted as the SQL editor's own role (not subject to RLS): one manual
--    row and one crawler row, with links that cannot clash with real events.
insert into public.events
  (title, description, event_datetime, event_end_datetime, location, address,
   hosted_by, event_type, external_link, genre, source)
values
  ('RLS check - manual fixture', 'events_admin_rls.sql', now() + interval '7 days',
   now() + interval '7 days 2 hours', 'Online', 'n/a', 'Unify', 'online',
   'https://example.invalid/events-admin-rls/manual-fixture', 'Socials', null),
  ('RLS check - crawler fixture', 'events_admin_rls.sql', now() + interval '7 days',
   now() + interval '7 days 2 hours', 'Online', 'n/a', 'Unify', 'online',
   'https://example.invalid/events-admin-rls/crawler-fixture', 'Socials', 'crawler:rls-check');

-- Guard: the placeholders were replaced, and each id has the expected permission.
do $$
begin
  if not exists (select 1 from public.users
                 where id::text = '<ADMIN_USER_ID>' and permissions = 'admin') then
    raise exception 'FAIL setup: <ADMIN_USER_ID> is not replaced, or that user is not permissions = ''admin''';
  end if;
  if not exists (select 1 from public.users
                 where id::text = '<NORMAL_USER_ID>' and permissions is distinct from 'admin') then
    raise exception 'FAIL setup: <NORMAL_USER_ID> is not replaced, or that user is an admin';
  end if;
end
$$;

-- ============================================================================
-- (a) As the ADMIN
-- ============================================================================
set local role authenticated;
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<ADMIN_USER_ID>', 'role', 'authenticated')::text,
  true
);

do $$
declare
  v_id integer;
  v_rows integer;
begin
  -- 1
  if not public.is_admin() then
    raise exception 'FAIL a1: is_admin() is false for the admin user';
  end if;

  -- 2) insert a manual row
  insert into public.events
    (title, event_datetime, location, address, event_type, external_link, genre, source)
  values
    ('RLS check - admin insert', now() + interval '8 days', 'Online', 'n/a', 'online',
     'https://example.invalid/events-admin-rls/admin-insert', 'Socials', null)
  returning id into v_id;
  if v_id is null then
    raise exception 'FAIL a2: admin could not insert a manual row';
  end if;

  -- 3) update it
  update public.events set title = 'RLS check - admin update' where id = v_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL a3: admin update of a manual row changed % rows (expected 1)', v_rows;
  end if;

  -- 4) delete it
  delete from public.events where id = v_id;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL a4: admin delete of a manual row removed % rows (expected 1)', v_rows;
  end if;

  -- 5) feature a crawler row (update is allowed on any row)
  update public.events set is_featured = true
  where external_link = 'https://example.invalid/events-admin-rls/crawler-fixture';
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'FAIL a5: admin could not feature a crawler row (% rows)', v_rows;
  end if;

  -- 6) cannot delete a crawler row (policy: source is null)
  delete from public.events
  where external_link = 'https://example.invalid/events-admin-rls/crawler-fixture';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL a6: admin DELETED a crawler row (% rows)', v_rows;
  end if;

  -- 7) cannot insert a row with a source (policy: source is null)
  begin
    insert into public.events
      (title, event_datetime, location, address, event_type, external_link, genre, source)
    values
      ('RLS check - admin crawler insert', now() + interval '8 days', 'Online', 'n/a',
       'online', 'https://example.invalid/events-admin-rls/admin-crawler-insert',
       'Socials', 'crawler:rls-check');
    raise exception 'FAIL a7: admin inserted a row with source set';
  exception
    when insufficient_privilege then null; -- expected: RLS with-check violation
  end;
end
$$;

-- ============================================================================
-- (b) As the NORMAL user (same role, different JWT subject)
-- ============================================================================
select set_config(
  'request.jwt.claims',
  json_build_object('sub', '<NORMAL_USER_ID>', 'role', 'authenticated')::text,
  true
);

do $$
declare
  v_rows integer;
begin
  -- 8
  if public.is_admin() then
    raise exception 'FAIL b1: is_admin() is true for the normal user';
  end if;

  -- 9) cannot insert a manual row
  begin
    insert into public.events
      (title, event_datetime, location, address, event_type, external_link, genre, source)
    values
      ('RLS check - normal insert', now() + interval '8 days', 'Online', 'n/a', 'online',
       'https://example.invalid/events-admin-rls/normal-insert', 'Socials', null);
    raise exception 'FAIL b2: normal user inserted an event';
  exception
    when insufficient_privilege then null; -- expected
  end;

  -- 10) cannot update a manual row (RLS filters it out: 0 rows, no error)
  update public.events set title = 'RLS check - normal update'
  where external_link = 'https://example.invalid/events-admin-rls/manual-fixture';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL b3: normal user UPDATED a manual row (% rows)', v_rows;
  end if;

  -- 11) cannot delete a manual row
  delete from public.events
  where external_link = 'https://example.invalid/events-admin-rls/manual-fixture';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL b4: normal user DELETED a manual row (% rows)', v_rows;
  end if;

  -- 12) cannot feature a crawler row
  update public.events set is_featured = false
  where external_link = 'https://example.invalid/events-admin-rls/crawler-fixture';
  get diagnostics v_rows = row_count;
  if v_rows <> 0 then
    raise exception 'FAIL b5: normal user UPDATED a crawler row (% rows)', v_rows;
  end if;
end
$$;

rollback;

-- Reached only when no check raised. Runs after the rollback, as the editor's role.
select 'events_admin_rls: all 12 checks passed (everything rolled back)' as result;
