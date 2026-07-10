import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { translateComment, translatePost } from "@/services/translations";
import type { SupportedLanguage } from "@/lib/i18n/config";
import { DEFAULT_LANGUAGE, isSupportedLanguage } from "@/lib/i18n/config";
import {
  trackTranslationCacheHit,
  trackTranslationCacheMiss,
  trackTranslationRequested,
} from "@/lib/analytics";

/**
 * On-demand translation hooks (i18n Phase 2). Nothing fetches automatically —
 * the Phase 3 Translate button calls `translate()`, and the result stays in
 * the TanStack cache (keyed by id + current UI language) so re-showing a
 * translation is instant and switching UI language re-translates.
 */

const TRANSLATION_KEY = ["translation"] as const;

function useCurrentLanguage(): SupportedLanguage {
  const { i18n } = useTranslation();
  return isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

function useContentTranslation(type: "post" | "comment", id: number) {
  const lang = useCurrentLanguage();

  const query = useQuery({
    queryKey: [...TRANSLATION_KEY, type, id, lang],
    queryFn: async () => {
      trackTranslationRequested({
        type,
        targetLanguage: lang,
        ...(type === "post" ? { postId: id } : {}),
      });
      const result =
        type === "post"
          ? await translatePost(id, lang)
          : await translateComment(id, lang);
      if (result.cached) {
        trackTranslationCacheHit({ type, targetLanguage: lang });
      } else {
        trackTranslationCacheMiss({ type, targetLanguage: lang });
      }
      return result;
    },
    enabled: false, // on-demand only
    staleTime: Infinity,
    retry: false,
  });

  return {
    /**
     * Trigger the translation. Note: `query.refetch` always invokes `queryFn`
     * (a network request + quota spend) even when cached data exists — check
     * `translation` first and skip calling this to avoid redundant requests.
     */
    translate: query.refetch,
    translation: query.data,
    isTranslating: query.isFetching,
    error: query.error,
    targetLanguage: lang,
  };
}

export function useTranslatePost(postId: number) {
  return useContentTranslation("post", postId);
}

export function useTranslateComment(commentId: number) {
  return useContentTranslation("comment", commentId);
}
