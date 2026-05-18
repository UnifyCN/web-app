import { useQuery, useMutation } from "@tanstack/react-query";
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
