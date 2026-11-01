// Companion task actions endpoint (mobile-app#361). Deployed from this repo next
// to rag-query, with verify_jwt = true (supabase/config.toml). The schema it calls
// is the mobile-app migration 20261025235536_companion_task_actions.sql, mirrored in
// supabase/migrations/ with #363, #366 and #365. Tests: supabase/tests/companion-actions/run.sh.
import { createClient } from 'jsr:@supabase/supabase-js@2';
import { sanityConfigFromEnv } from '../rag-query/lib/context/appContext.ts';
import { contentLookupFromEnv, createHandler } from './handler.ts';
import { createTaskLister } from './targets.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const admin = createClient(supabaseUrl, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
  auth: { persistSession: false, autoRefreshToken: false },
});
// #365: the caller's Checklist, read as the caller (anon key + their JWT), to name tasks.
const listTasks = createTaskLister({
  supabaseUrl,
  anonKey: Deno.env.get('SUPABASE_ANON_KEY')!,
  sanity: sanityConfigFromEnv(key => Deno.env.get(key)),
});

Deno.serve(createHandler({ admin, contentTaskExists: contentLookupFromEnv(k => Deno.env.get(k)), listTasks }));
