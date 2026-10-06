import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useQueryClient } from "@tanstack/react-query";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "@/lib/i18n/config";
import { ensureLocale, markUserPicked, persistLocale } from "@/lib/i18n";
import { updatePreferredLanguage } from "@/services/language";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";

/**
 * Read + change the active UI language. Mirrors the mobile app's
 * `hooks/useLanguage.ts`: the change applies instantly (i18next + localStorage +
 * cookie), then best-effort syncs to the shared `preferred_language` column and
 * refreshes the cached profile.
 */
export function useLanguage() {
  const { i18n } = useTranslation();
  const queryClient = useQueryClient();

  const currentLanguage = (i18n.language || "en") as SupportedLanguage;

  const changeLanguage = useCallback(
    async (lang: SupportedLanguage) => {
      if (lang === i18n.language) return;
      // Load the language before anything changes. `persistLocale` flips
      // <html lang dir> at once, so doing it first would turn the page
      // right-to-left (or back) while the old text was still on screen.
      try {
        await ensureLocale(i18n, lang);
      } catch (e) {
        console.error("language bundle failed to load", e);
        return;
      }
      markUserPicked();
      persistLocale(lang);
      await i18n.changeLanguage(lang);
      try {
        await updatePreferredLanguage(lang);
      } catch (e) {
        console.error("preferred_language sync failed", e);
      }
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
    },
    [i18n, queryClient],
  );

  return {
    currentLanguage,
    changeLanguage,
    supportedLanguages: SUPPORTED_LANGUAGES,
  };
}
