-- API-role grants on the public schema (least privilege).
-- Supabase provisions baseline grants by default, but `drop schema public
-- cascade` (used when rebuilding this project) wipes them — without USAGE on the
-- schema the API roles can't reach any table. RLS still gates row access; these
-- grants only control which verbs each role may attempt.

grant usage on schema public to anon, authenticated, service_role;
grant all on schema public to postgres, service_role;

-- service_role: full access (bypasses RLS).
grant all on all tables    in schema public to service_role;
grant all on all sequences in schema public to service_role;
grant all on all routines  in schema public to service_role;
alter default privileges in schema public grant all on tables    to service_role;
alter default privileges in schema public grant all on sequences to service_role;
alter default privileges in schema public grant all on routines  to service_role;

-- authenticated: DML on tables; row access still gated by RLS policies.
grant select, insert, update, delete on all tables in schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
grant execute on all routines in schema public to authenticated;
alter default privileges in schema public grant select, insert, update, delete on tables to authenticated;
alter default privileges in schema public grant usage, select on sequences to authenticated;
alter default privileges in schema public grant execute on routines to authenticated;

-- anon: read-only, limited to the public-facing tables (no default privileges,
-- so future tables are never auto-exposed to anon).
grant select on public.events            to anon;
grant select on public.news_details      to anon;
grant select on public.community_circles to anon;
