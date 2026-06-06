import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as profile from "@/services/profile";

/** React Query hooks for Profile data. */

export function useCurrentUser() {
  return useQuery({
    queryKey: ["current-user"],
    queryFn: profile.getCurrentUser,
  });
}

export function useUserProfile(id: string) {
  return useQuery({
    queryKey: ["users", id],
    queryFn: () => profile.getUserById(id),
  });
}

export function useLessonHighlights() {
  return useQuery({
    queryKey: ["lesson-highlights"],
    queryFn: profile.getLessonHighlights,
  });
}

export function useFollowUser() {
  return useMutation({ mutationFn: profile.followUser });
}

export function useUnfollowUser() {
  return useMutation({ mutationFn: profile.unfollowUser });
}

/** Edit bio + pronouns; refreshes the cached current user on success. */
export function useUpdateUserDetails() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: profile.UpdateUserDetailsInput) =>
      profile.updateUserDetails(input),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["current-user"] }),
  });
}

/** Refresh both the current user and the feed so author avatars update. */
function invalidateAvatarQueries(queryClient: ReturnType<typeof useQueryClient>) {
  queryClient.invalidateQueries({ queryKey: ["current-user"] });
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
