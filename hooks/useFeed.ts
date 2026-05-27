import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedTab } from "@/types";
import * as feed from "@/services/feed";

/** React Query hooks for feed / posts data. */

const FEED_KEY = ["feed"] as const;

/* ---- Per-tab feed queries (first-page-only) --------------------------- */

export function useForYouFeed() {
  return useQuery({
    queryKey: [...FEED_KEY, "forYou"],
    queryFn: () => feed.getForYouFeed(),
  });
}

export function useFollowingFeed() {
  return useQuery({
    queryKey: [...FEED_KEY, "following"],
    queryFn: () => feed.getFollowingFeed(),
  });
}

export function useGroupsFeed() {
  return useQuery({
    queryKey: [...FEED_KEY, "groups"],
    queryFn: () => feed.getGroupsFeed(),
  });
}

/** Backwards-compatible single-hook entry point — picks the right per-tab
 *  query under the hood. Returns just the posts array (no nextCursor). */
export function useFeedPosts(tab: FeedTab = "For You") {
  const forYou = useForYouFeed();
  const following = useFollowingFeed();
  const groups = useGroupsFeed();

  const active =
    tab === "Following" ? following : tab === "Groups" ? groups : forYou;

  return {
    ...active,
    data: active.data?.posts,
  };
}

/* ---- Unwired mock-only hooks ----------------------------------------- */

export function useGroupPosts(groupId: string) {
  return useQuery({
    queryKey: [...FEED_KEY, "group", groupId],
    queryFn: () => feed.getGroupPosts(groupId),
  });
}

export function useUserPosts(userId: string) {
  return useQuery({
    queryKey: [...FEED_KEY, "user", userId],
    queryFn: () => feed.getUserPosts(userId),
  });
}

export function useSavedPosts() {
  return useQuery({
    queryKey: [...FEED_KEY, "saved"],
    queryFn: feed.getSavedPosts,
  });
}

/* ---- Mutations -------------------------------------------------------- */

interface LikeInput {
  postId: number;
  /** Current like state — the mutation flips it. */
  liked: boolean;
}

export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, liked }: LikeInput) =>
      liked ? feed.unlikePost(postId) : feed.likePost(postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

interface SaveInput {
  postId: number;
  /** Current save state — the mutation flips it. */
  saved: boolean;
}

export function useSavePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, saved }: SaveInput) =>
      saved ? feed.unsavePost(postId) : feed.savePost(postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}
