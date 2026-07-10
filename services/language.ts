import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { SupportedLanguage } from "@/lib/i18n/config";

/**
 * Persist the user's preferred UI language to the shared
 * `user_onboarding_profiles.preferred_language` column — the same column the
 * mobile app writes, so a choice made on one platform syncs to the other.
 *
 * Best-effort by design: the language is already applied + stored client-side
 * (localStorage + cookie) before this runs, so an unauthenticated caller or a
 * missing onboarding row is a silent no-op, and a write error is logged rather
 * than thrown (nothing user-facing depends on the round-trip succeeding).
 */
export async function updatePreferredLanguage(
  lang: SupportedLanguage,
): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) return;

  const supabase = createClient();
  const { error } = await supabase
    .from("user_onboarding_profiles")
    .update({ preferred_language: lang })
    .eq("id", userId);
  if (error) {
    console.error("updatePreferredLanguage failed", error);
  }
}
