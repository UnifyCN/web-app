"use client";

import { useCallback } from "react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { prefetchChecklist } from "@/hooks/useChecklist";
import { prefetchCommunity, prefetchNews } from "@/hooks/useCommunity";
import { prefetchCompanion } from "@/hooks/useCompanion";
import { prefetchCoverLetterList } from "@/hooks/useCoverLetter";
import { prefetchForYouFeed, prefetchUserPosts } from "@/hooks/useFeed";
import { useLanguage } from "@/hooks/useLanguage";
import { prefetchLearn } from "@/hooks/useLearn";
import { prefetchBlockedUsers } from "@/hooks/useModeration";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";
import { prefetchResumeList } from "@/hooks/useResume";

type TabPrefetcher = (
  queryClient: QueryClient,
  language: string,
) => Promise<unknown>;

/**
 * What each main tab needs before it can show content, keyed by nav href. Each
 * entry calls the `prefetch*` helper that lives beside the tab's own hooks, so
 * the keys and fetchers can't drift from what the page reads. Resources is
 * absent on purpose: it is static. Settings needs the current user, which every
 * page already loads, plus its blocked-accounts list.
 */
const TAB_PREFETCHERS: Record<string, TabPrefetcher> = {
  "/home": (queryClient, language) =>
    Promise.all([
      prefetchForYouFeed(queryClient),
      prefetchNews(queryClient),
      // The Learning progress widget reads the module list.
      prefetchLearn(queryClient, language),
    ]),
  "/learn": prefetchLearn,
  "/checklist": prefetchChecklist,
  "/companion": prefetchCompanion,
  "/resume": (queryClient) =>
    Promise.all([
      prefetchResumeList(queryClient),
      prefetchCoverLetterList(queryClient),
    ]),
  "/community": prefetchCommunity,
  "/profile": (queryClient) => {
    const me = queryClient.getQueryData<{ id?: string }>(CURRENT_USER_KEY);
    return me?.id ? prefetchUserPosts(queryClient, me.id) : Promise.resolve();
  },
  "/settings": prefetchBlockedUsers,
};

export const PREFETCHABLE_TABS = Object.keys(TAB_PREFETCHERS);

/**
 * Returns `prefetchTab(href)`: warms that tab's data so it opens with content
 * instead of a skeleton. Safe to call often: React Query skips anything that
 * is already fresh, and a failed prefetch is silent (the page fetches as usual).
 */
export function usePrefetchTab() {
  const queryClient = useQueryClient();
  const { currentLanguage } = useLanguage();

  return useCallback(
    (href: string): Promise<unknown> => {
      const prefetch = TAB_PREFETCHERS[href];
      if (!prefetch) return Promise.resolve();
      return prefetch(queryClient, currentLanguage).catch(() => undefined);
    },
    [queryClient, currentLanguage],
  );
}
