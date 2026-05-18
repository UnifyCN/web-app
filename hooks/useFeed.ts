import { useQuery, useMutation } from "@tanstack/react-query";
import type { FeedTab } from "@/types";
import * as feed from "@/services/feed";

/** React Query hooks for feed / posts data. */

export function useFeedPosts(tab: FeedTab = "For You") {
  return useQuery({
    queryKey: ["feed", tab],
    queryFn: () => feed.getFeedPosts(tab),
  });
}

export function useGroupPosts(groupId: string) {
  return useQuery({
    queryKey: ["feed", "group", groupId],
    queryFn: () => feed.getGroupPosts(groupId),
  });
}

export function useUserPosts(userId: string) {
  return useQuery({
    queryKey: ["feed", "user", userId],
    queryFn: () => feed.getUserPosts(userId),
  });
}

export function useSavedPosts() {
  return useQuery({ queryKey: ["feed", "saved"], queryFn: feed.getSavedPosts });
}

export function useLikePost() {
  return useMutation({ mutationFn: feed.likePost });
}

export function useSavePost() {
  return useMutation({ mutationFn: feed.savePost });
}
