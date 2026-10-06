import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import { getSessionUser } from "@/services/auth";
import * as moderation from "@/services/moderation";

/**
 * React Query hooks for block / report. Mutations invalidate the feed (so
 * blocked authors disappear) and the moderation namespace (blocked-id list +
 * per-user block status). Toasts/UI feedback live in the calling components,
 * matching the feed mutation hooks.
 */

const FEED_KEY = ["feed"] as const;
const MODERATION_KEY = ["moderation"] as const;

/**
 * The ids this user has blocked. The feed needs the list before it can ask for
 * posts (blocked authors are excluded in the posts query itself, so their posts
 * never reach the browser), which makes it part of the feed's critical path.
 * It rarely changes, so it is kept for a long time and refetched only when the
 * user blocks or unblocks someone here (see `invalidateAfterBlockChange`).
 *
 * The entry is keyed by the signed-in user's id, so one account's list can
 * never be applied to another account in the same tab.
 */
const BLOCKED_IDS_STALE_MS = 10 * 60_000;

async function blockedUserIdsQuery() {
  const user = await getSessionUser();
  return {
    queryKey: [...MODERATION_KEY, "blocked-ids", user?.id ?? null],
    queryFn: moderation.getBlockedUserIds,
    staleTime: BLOCKED_IDS_STALE_MS,
  };
}

/**
 * The blocked-id list for a feed request: the cached list while it is fresh,
 * otherwise a new fetch. `fetchQuery` (not `ensureQueryData`) on purpose: after
 * a block the entry is invalidated, and an invalidated list must not be used.
 */
export async function fetchBlockedUserIds(queryClient: QueryClient) {
  return queryClient.fetchQuery(await blockedUserIdsQuery());
}

/** Starts loading the blocked-id list early, so the feed finds it ready. */
export async function prefetchBlockedUserIds(queryClient: QueryClient) {
  return queryClient.prefetchQuery(await blockedUserIdsQuery());
}

/** Blocked accounts with display info, for the Settings management list. */
export function useBlockedUsers() {
  return useQuery({
    queryKey: [...MODERATION_KEY, "blocked-users"],
    queryFn: moderation.getBlockedUsers,
  });
}

/** Warms the Settings page's blocked-accounts list (same key and fetcher as
 *  `useBlockedUsers`). */
export function prefetchBlockedUsers(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
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
  // Moderation first: the feed's refetch reads the cached blocked-id list, and
  // it must already be marked out of date by the time that refetch starts.
  queryClient.invalidateQueries({ queryKey: MODERATION_KEY });
  // Invalidating FEED_KEY also covers the prefixed profile-post queries
  // (["feed","user",id]).
  queryClient.invalidateQueries({ queryKey: FEED_KEY });
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
