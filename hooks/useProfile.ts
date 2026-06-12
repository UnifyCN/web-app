import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as profile from "@/services/profile";
import type { UserProfile } from "@/types";

/** React Query hooks for Profile data. */

/** Canonical query key for the signed-in user; shared by every reader/mutator
 *  so invalidations always hit the same cache entry. */
export const CURRENT_USER_KEY = ["current-user"] as const;

export function useCurrentUser() {
  return useQuery({
    queryKey: CURRENT_USER_KEY,
    queryFn: profile.getCurrentUser,
  });
}

export function useUserProfile(id: string) {
  return useQuery({
    queryKey: ["user-profile", id],
    queryFn: () => profile.getUserById(id),
    enabled: Boolean(id),
  });
}

export function useLessonHighlights() {
  return useQuery({
    queryKey: ["lesson-highlights"],
    queryFn: profile.getLessonHighlights,
  });
}

/* ---- follow graph ----------------------------------------------------- */

export function useFollowStatus(
  userId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["follow-status", userId],
    queryFn: () => profile.getFollowStatus(userId),
    enabled: options?.enabled ?? Boolean(userId),
  });
}

export function useFollowsYou(
  userId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: ["follows-you", userId],
    queryFn: () => profile.getFollowsYou(userId),
    enabled: options?.enabled ?? Boolean(userId),
  });
}

export function useFollowers(userId: string) {
  return useQuery({
    queryKey: ["followers", userId],
    queryFn: () => profile.getFollowers(userId),
    enabled: Boolean(userId),
  });
}

export function useFollowing(userId: string) {
  return useQuery({
    queryKey: ["following", userId],
    queryFn: () => profile.getFollowing(userId),
    enabled: Boolean(userId),
  });
}

/** Shared follow / unfollow mutation. Optimistically writes the new follow
 *  state into the `["follow-status", userId]` cache (so every FollowButton for
 *  that user flips instantly), rolls back on error, then on success refreshes
 *  the caller's profile, the target profile, the follow-status, and the
 *  Following feed. */
function useFollowMutation(
  mutationFn: (userId: string) => Promise<void>,
  optimisticFollowing: boolean,
) {
  const queryClient = useQueryClient();
  const delta = optimisticFollowing ? 1 : -1;

  const bumpFollowing = (p: UserProfile): UserProfile => ({
    ...p,
    followingCount: Math.max(0, p.followingCount + delta),
  });

  return useMutation({
    mutationFn,
    onMutate: async (userId: string) => {
      const statusKey = ["follow-status", userId];
      const targetKey = ["user-profile", userId];
      const meKey = ["current-user"];

      // Stop in-flight refetches (any profile query) from clobbering the
      // optimistic values.
      await Promise.all([
        queryClient.cancelQueries({ queryKey: statusKey }),
        queryClient.cancelQueries({ queryKey: ["user-profile"] }),
        queryClient.cancelQueries({ queryKey: meKey }),
      ]);

      const prevStatus = queryClient.getQueryData<boolean>(statusKey);
      const prevTarget = queryClient.getQueryData<UserProfile>(targetKey);
      const prevMe = queryClient.getQueryData<UserProfile>(meKey);
      const myId = prevMe?.id;
      const prevMyProfile = myId
        ? queryClient.getQueryData<UserProfile>(["user-profile", myId])
        : undefined;

      // Flip the button.
      queryClient.setQueryData(statusKey, optimisticFollowing);

      // Target's follower count (updater form so it applies to whatever's cached).
      queryClient.setQueryData<UserProfile | undefined>(targetKey, (old) =>
        old
          ? { ...old, followerCount: Math.max(0, old.followerCount + delta) }
          : old,
      );

      // My following count — patch wherever it's shown: the current-user cache
      // and, if I'm viewing my own profile via /profile/[id], that entry too.
      queryClient.setQueryData<UserProfile | undefined>(meKey, (old) =>
        old ? bumpFollowing(old) : old,
      );
      if (myId) {
        queryClient.setQueryData<UserProfile | undefined>(
          ["user-profile", myId],
          (old) => (old ? bumpFollowing(old) : old),
        );
      }

      return { prevStatus, prevTarget, prevMe, prevMyProfile, myId };
    },
    onError: (_error, userId, context) => {
      if (context?.prevStatus !== undefined) {
        queryClient.setQueryData(["follow-status", userId], context.prevStatus);
      }
      if (context?.prevTarget) {
        queryClient.setQueryData(["user-profile", userId], context.prevTarget);
      }
      if (context?.prevMe) {
        queryClient.setQueryData(["current-user"], context.prevMe);
      }
      if (context?.myId && context?.prevMyProfile) {
        queryClient.setQueryData(
          ["user-profile", context.myId],
          context.prevMyProfile,
        );
      }
    },
    onSuccess: () => {
      // Partial-key invalidation reconciles whichever profile is on screen,
      // regardless of its exact id.
      queryClient.invalidateQueries({ queryKey: ["user-profile"] });
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
      queryClient.invalidateQueries({ queryKey: ["follow-status"] });
      queryClient.invalidateQueries({ queryKey: ["feed", "following"] });
    },
  });
}

export function useFollowUser() {
  return useFollowMutation(profile.followUser, true);
}

export function useUnfollowUser() {
  return useFollowMutation(profile.unfollowUser, false);
}

/** Edit bio + pronouns; refreshes the cached current user on success. */
export function useUpdateUserDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: profile.UpdateUserDetailsInput) =>
      profile.updateUserDetails(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
  });
}

/** Edit the @username handle; refreshes the cached current user on success. */
export function useUpdateUsername() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (username: string) => profile.updateUsername(username),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
  });
}

/** Refresh both the current user and the feed so author avatars update. */
function invalidateAvatarQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
  queryClient.invalidateQueries({ queryKey: ["feed"] });
}

/** Upload a new avatar and persist its URL on the current user. */
export function useUpdateAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (file: File) => profile.updateAvatar(file),
    onSuccess: () => invalidateAvatarQueries(queryClient),
  });
}

/** Remove the current user's avatar. */
export function useRemoveAvatar() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => profile.removeAvatar(),
    onSuccess: () => invalidateAvatarQueries(queryClient),
  });
}
