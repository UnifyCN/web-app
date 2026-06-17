import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as moderation from "@/services/moderation";

/**
 * React Query hooks for block / report. Mutations invalidate the feed (so
 * blocked authors disappear) and the moderation namespace (blocked-id list +
 * per-user block status). Toasts/UI feedback live in the calling components,
 * matching the feed mutation hooks.
 */

const FEED_KEY = ["feed"] as const;
const MODERATION_KEY = ["moderation"] as const;

export function useBlockedUserIds() {
  return useQuery({
    queryKey: [...MODERATION_KEY, "blocked-ids"],
    queryFn: moderation.getBlockedUserIds,
  });
}

/** Blocked accounts with display info, for the Settings management list. */
export function useBlockedUsers() {
  return useQuery({
    queryKey: [...MODERATION_KEY, "blocked-users"],
    queryFn: moderation.getBlockedUsers,
  });
}

export function useUserBlockStatus(
  userId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...MODERATION_KEY, "block-status", userId],
    queryFn: () => moderation.isUserBlocked(userId),
    enabled: options?.enabled ?? Boolean(userId),
  });
}

/** Invalidate the feed (refilter) + moderation queries after a block change. */
function invalidateAfterBlockChange(
  queryClient: ReturnType<typeof useQueryClient>,
) {
  // Invalidating FEED_KEY also covers the prefixed profile-post queries
  // (["feed","user",id]).
  queryClient.invalidateQueries({ queryKey: FEED_KEY });
  queryClient.invalidateQueries({ queryKey: MODERATION_KEY });
}

export function useBlockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockedUserId: string) => moderation.blockUser(blockedUserId),
    onSuccess: () => invalidateAfterBlockChange(queryClient),
  });
}

export function useUnblockUser() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (blockedId: string) => moderation.unblockUser(blockedId),
    onSuccess: () => invalidateAfterBlockChange(queryClient),
  });
}

interface ReportPostInput {
  postId: number;
  reason: string;
}

export function useReportPost() {
  return useMutation({
    mutationFn: ({ postId, reason }: ReportPostInput) =>
      moderation.reportPost(postId, reason),
  });
}

interface ReportUserInput {
  userId: string;
  reason: string;
}

export function useReportUser() {
  return useMutation({
    mutationFn: ({ userId, reason }: ReportUserInput) =>
      moderation.reportUser(userId, reason),
  });
}
