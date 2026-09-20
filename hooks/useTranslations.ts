import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import {
  translateComment,
  translateDiscussion,
  translateDiscussionReply,
  translateEvent,
  translateGroup,
  translatePost,
  translateTip,
  type TranslatableType,
  type TranslationResult,
} from "@/services/translations";
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

/**
 * One translator per content kind. A map rather than a ternary chain so adding
 * a kind is a line here and the compiler names the gap if it is forgotten
 * (Record over the full union).
 *
 * The `as number` / `as string` casts are the same ones the callers already
 * make: the id shape is fixed per kind, and /api/translate rejects a mismatch.
 */
const TRANSLATORS: Record<
  TranslatableType,
  (id: number | string, lang: SupportedLanguage) => Promise<TranslationResult>
> = {
  post: (id, lang) => translatePost(id as number, lang),
  comment: (id, lang) => translateComment(id as number, lang),
  discussion: (id, lang) => translateDiscussion(id as string, lang),
  discussion_reply: (id, lang) => translateDiscussionReply(id as string, lang),
  event: (id, lang) => translateEvent(id as number, lang),
  group: (id, lang) => translateGroup(id as number, lang),
  tip: (id, lang) => translateTip(id as string, lang),
};

function useCurrentLanguage(): SupportedLanguage {
  const { i18n } = useTranslation();
  return isSupportedLanguage(i18n.language) ? i18n.language : DEFAULT_LANGUAGE;
}

/** Shared by TranslateButton — prefer the typed wrappers below elsewhere. */
export function useContentTranslation(
  type: TranslatableType,
  id: number | string,
) {
  const lang = useCurrentLanguage();

  const query = useQuery({
    queryKey: [...TRANSLATION_KEY, type, id, lang],
    queryFn: async () => {
      trackTranslationRequested({
        type,
        targetLanguage: lang,
        ...(type === "post" ? { postId: id as number } : {}),
      });
      const result = await TRANSLATORS[type](id, lang);
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

export function useTranslateDiscussion(discussionId: string) {
  return useContentTranslation("discussion", discussionId);
}

export function useTranslateDiscussionReply(replyId: string) {
  return useContentTranslation("discussion_reply", replyId);
}

export function useTranslateEvent(eventId: number) {
  return useContentTranslation("event", eventId);
}

export function useTranslateGroup(groupId: number) {
  return useContentTranslation("group", groupId);
}

export function useTranslateTip(tipId: string) {
  return useContentTranslation("tip", tipId);
}
