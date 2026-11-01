-- Probe only (never applied to a real project): records every write statement
-- on the tables a Companion answer must not change. Statement-level triggers
-- fire even when the write leaves every row equal or matches no row, so the
-- probe sees write attempts, not only changed rows.

create schema probe_audit;
revoke all on schema probe_audit from public;

create table probe_audit.write_attempts (
  id bigint generated always as identity primary key,
  table_name text not null,
  operation text not null,
  -- The request role PostgREST set (authenticated, service_role, ...).
  request_role text,
  at timestamptz not null default clock_timestamp()
);

create function probe_audit.record_write() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into probe_audit.write_attempts (table_name, operation, request_role)
  values (tg_table_name, tg_op, current_setting('role', true));
  return null;
end;
$$;
revoke all on function probe_audit.record_write() from public;

do $$
declare t text;
begin
  foreach t in array array['user_onboarding_profiles', 'user_tasks', 'custom_checklist_tasks', 'conversations', 'messages'] loop
    execute format(
      'create trigger probe_write_audit after insert or update or delete on public.%I for each statement execute function probe_audit.record_write()',
      t
    );
  end loop;
end;
$$;

-- Readable through PostgREST (Accept-Profile: probe_audit) by the service role only.
grant usage on schema probe_audit to service_role;
grant select on probe_audit.write_attempts to service_role;
