// Companion task actions endpoint (mobile-app#361). Deployed from this repo next
// to rag-query, with verify_jwt = true (supabase/config.toml). The schema it calls
// is the mobile-app migration 20261025235536_companion_task_actions.sql, mirrored in
// supabase/migrations/. Tests: supabase/tests/companion-actions/run.sh.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { createHandler } from './handler.ts';

const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});

Deno.serve(createHandler({ admin }));
