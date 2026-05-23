import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

/** True once the Supabase project env vars are populated (Phase 0). */
export function isSupabaseConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL &&
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  );
}

let browserClient: SupabaseClient | undefined;

/**
 * Browser-side Supabase client — a singleton. Multiple createBrowserClient
 * instances share one cookie storage key and interfere with each other's auth
 * state (Supabase warns: "Multiple GoTrueClient instances detected"), which
 * leaves PostgREST calls running as `anon`. One shared instance keeps the
 * session/token consistent across every call site.
 */
export function createClient() {
  if (browserClient) return browserClient;
  browserClient = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
  );
  return browserClient;
}
