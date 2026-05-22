-- Restore API-role grants on the public schema.
-- Supabase provisions these by default, but `drop schema public cascade` (used
-- when rebuilding this project) wipes them — without USAGE on the schema the
-- anon/authenticated roles can't reach any table and every request fails with
-- permission denied. RLS still gates row access; these only restore reachability.

grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

grant all on all tables    in schema public to anon, authenticated, service_role;
grant all on all sequences in schema public to anon, authenticated, service_role;
grant all on all routines  in schema public to anon, authenticated, service_role;

alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on routines  to anon, authenticated, service_role;
