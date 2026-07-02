-- Add signup_source to public.users to track the platform a user first signed up on.
--
-- The public.users row is created by the shared, mobile-owned handle_new_user()
-- trigger at auth.signUp time (for both web and mobile), which does not set this
-- column. Each app stamps it itself, guarded on NULL so it is written once and
-- never overwritten:
--   web    -> 'web'   (lib/supabase/ensureUserRow.ts, via the signup entry points)
--   mobile -> 'ios' | 'android'  (Savar: unify-front-end/utils/createUserIfNotExists.ts)
--
-- Nullable, no default, no CHECK constraint: this is a live shared DB, and a
-- strict CHECK would risk 23514 failures if a client writes an unexpected value.
-- The allowed vocabulary is documented in the column comment instead.
--
-- Apply via the Supabase dashboard SQL editor (the MCP is read-only and
-- `supabase db push` is unsafe against the drifted remote migration history).
-- Adding a nullable column with no default is an instant catalog change — safe
-- with live users.

alter table public.users
  add column if not exists signup_source text;

comment on column public.users.signup_source is
  'Platform the user first signed up on: web | ios | android. Nullable; stamped '
  'app-side on first authenticated touch and never overwritten once set. Legacy '
  'rows (created before this column) stay null.';
