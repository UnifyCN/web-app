import 'jsr:@supabase/functions-js/edge-runtime.d.ts';
import { createClient } from 'jsr:@supabase/supabase-js@2';

import { ACTIVE_SOURCES, ADAPTERS, makeContext } from './lib/sources.ts';
import type { EventRow } from './lib/types.ts';

// ============================================================================
// events-crawler — BC settlement-org and library events → public.events
// ----------------------------------------------------------------------------
// Cron-triggered (see 20260722120000_events_crawler.sql for the source column and
// 20260724120000_events_crawler_cron.sql for the schedule): pg_cron POSTs here with the
// service-role key as the Bearer token. Each enabled source is pulled by its adapter and
// mapped to rows shaped IDENTICALLY to the events Savar enters by hand (same columns,
// same CommunityEvent render path in EventCard.tsx + the event detail page). Scraped rows
// are tagged `source = 'crawler:<slug>'` so they stay distinguishable from manual rows.
//
// Mirrors supabase/functions/news-crawler/index.ts: same service-role Bearer auth
// (verify_jwt=true, no CORS — server-to-server only), and the same image-quality trio
// (icon-URL reject + SSRF guard + HEAD size check). INSERT-only: no delete/prune. Rows
// outside the rolling window are never ingested, and ones that age out of it simply stop
// matching the web reader's window filter — they are not removed, because mobile reads
// this same table with no date filter and a Past tab.
//
// Each row is tagged with a `genre` (lib/genre.ts) so both apps can filter by topic.
//
// Shared prod DB (web + mobile) — inserted events appear in BOTH apps immediately, which
// is why new sources land `enabled: false`. See Source.enabled in lib/types.ts.
// ============================================================================

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Read a JWT payload's `role` claim WITHOUT verifying the signature. Safe to trust ONLY
 * because this function runs with verify_jwt=true (config.toml) — the gateway has already
 * verified the signature before we get here. Returns null on any malformed token.
 */
function jwtRole(token: string): string | null {
  try {
    const payload = token.split('.')[1];
    if (!payload) return null;
    const b64 = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    const claims = JSON.parse(atob(padded)) as { role?: string };
    return typeof claims.role === 'string' ? claims.role : null;
  } catch {
    return null;
  }
}

Deno.serve(async (req: Request) => {
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Missing Supabase env vars' }, 500);
  }

  // Server-to-server only: the cron sends the service-role key as Bearer. The gateway
  // (verify_jwt=true) has already verified the token's signature, so accept either an
  // exact service-role-key match OR any token whose verified role is service_role. On
  // rejection, log the presented role (never the token).
  const token = req.headers.get('Authorization')?.replace('Bearer ', '').trim();
  const authorized =
    !!token && (token === serviceRoleKey.trim() || jwtRole(token) === 'service_role');
  if (!authorized) {
    console.error(
      `events-crawler: unauthorized — bearer role=${
        token ? (jwtRole(token) ?? 'unknown') : 'missing'
      }`,
    );
    return jsonResponse({ error: 'Unauthorized' }, 401);
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const ctx = makeContext();

  const perSourceResults = await Promise.all(
    ACTIVE_SOURCES.map(async (source) => ({
      slug: source.slug,
      rows: await ADAPTERS[source.kind](source, ctx),
    })),
  );

  const collected: EventRow[] = [];
  const perOrg: Record<string, number> = {};
  for (const { slug, rows } of perSourceResults) {
    perOrg[slug] = rows.length;
    collected.push(...rows);
  }

  // Dedupe within the batch by external_link.
  const seen = new Set<string>();
  const batch = collected.filter((row) => {
    if (seen.has(row.external_link)) return false;
    seen.add(row.external_link);
    return true;
  });

  if (batch.length === 0) {
    return jsonResponse({ ok: true, perOrg, fetched: 0, inserted: 0 });
  }

  // Dedupe against the DB by external_link. The real guarantee is the unique index
  // events_external_link_key (20260724130000_events_external_link_unique.sql) paired with
  // the ignoreDuplicates upsert below — a read-then-insert alone would race, since a
  // manual trigger overlapping the cron could have both runs pass this check. This filter
  // is defence-in-depth: it keeps the common case from shipping rows the DB would only
  // discard, and it keeps `inserted` meaningful.
  //
  // Scoped to THIS batch's links rather than selecting the whole column, so the lookup can
  // never be silently truncated by the API row cap as the table grows. Scoping by link
  // (not by source) keeps the manual-row protection: a link Savar entered by hand still
  // blocks a crawler re-insert.
  //
  // Chunked because the filter travels in a GET query string: links run ~140 chars (~200
  // URL-encoded), so 25 per request keeps it near 5KB, well under the gateway's ~8KB
  // request-line cap.
  const EXISTING_LOOKUP_CHUNK = 25;
  const existingLinks = new Set<string>();
  for (let i = 0; i < batch.length; i += EXISTING_LOOKUP_CHUNK) {
    const chunk = batch.slice(i, i + EXISTING_LOOKUP_CHUNK).map((row) => row.external_link);
    const { data: existing, error: existingError } = await supabase
      .from('events')
      .select('external_link')
      .in('external_link', chunk);
    if (existingError) {
      console.error('events-crawler: existing-link select failed:', existingError);
      return jsonResponse({ error: 'Select failed', detail: existingError.message }, 500);
    }
    for (const row of (existing ?? []) as { external_link: string | null }[]) {
      if (row.external_link) existingLinks.add(row.external_link);
    }
  }
  const toInsert = batch.filter((row) => !existingLinks.has(row.external_link));

  if (toInsert.length === 0) {
    return jsonResponse({ ok: true, perOrg, fetched: batch.length, inserted: 0 });
  }

  // ON CONFLICT (external_link) DO NOTHING via the UNIQUE index, so a run that loses the
  // race to a concurrent invocation is a silent no-op instead of a 23505. .select()
  // returns only the rows actually inserted, so its length is the true insert count.
  const { data, error } = await supabase
    .from('events')
    .upsert(toInsert, { onConflict: 'external_link', ignoreDuplicates: true })
    .select('id');
  if (error) {
    console.error('events-crawler: insert failed:', error);
    return jsonResponse({ error: 'Insert failed', detail: error.message }, 500);
  }

  return jsonResponse({
    ok: true,
    perOrg,
    fetched: batch.length,
    inserted: data?.length ?? 0,
  });
});
