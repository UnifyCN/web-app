"use client";

import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useCurrentUser } from "@/hooks/useProfile";
import { updatePreferredLanguage } from "@/services/language";
import { hasUserPickedThisSession, persistLocale } from "./index";
import {
  isLanguageEnabled,
  isSupportedLanguage,
  type SupportedLanguage,
} from "./config";

/**
 * On first authed load, reconcile the local UI language with the user's
 * `preferred_language` on the shared DB (mirrors the mobile app's
 * `useLanguageSyncFromSupabase`):
 *   - user actively picked a language this session → push the local choice up
 *     (propagates to their other devices / mobile);
 *   - no explicit pick → pull the server value down (a returning user on a new
 *     browser gets the language they set on mobile).
 * One-shot per user id per session; account switches re-sync.
 */
function useLanguageSync() {
  const { data: currentUser } = useCurrentUser();
  const { i18n } = useTranslation();
  const syncedForUserRef = useRef<string | null>(null);

  const remote = currentUser?.onboarding?.preferredLanguage;

  useEffect(() => {
    const userId = currentUser?.id;
    // Wait for the onboarding row — that's where preferred_language lives.
    if (!userId || !currentUser?.onboarding) return;
    if (syncedForUserRef.current === userId) return;
    syncedForUserRef.current = userId;

    const local = i18n.language as SupportedLanguage;

    if (hasUserPickedThisSession()) {
      if (isSupportedLanguage(local) && local !== remote) {
        void updatePreferredLanguage(local);
      }
      // Restoring a DB-stored preference onto this device: gate it too, not just
      // validity. A value can be a real SupportedLanguage yet currently gated —
      // e.g. set on a build/device where the flag was on — and applying it here
      // would re-enable a hidden/unreviewed catalog regardless of this build's flag.
    } else if (
      isSupportedLanguage(remote) &&
      isLanguageEnabled(remote) &&
      remote !== local
    ) {
      persistLocale(remote);
      void i18n.changeLanguage(remote);
    }
  }, [currentUser?.id, currentUser?.onboarding, remote, i18n]);
}

/**
 * Null-rendering client component so the server-rendered `(main)` layout can
 * mount the one-shot language sync without becoming a client component itself.
 */
export function LanguageSync() {
  useLanguageSync();
  return null;
}
