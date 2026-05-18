import type { UserProfile } from "@/types";
import {
  currentUser,
  getUserById as findUser,
  lessonHighlights,
  type LessonHighlight,
} from "@/lib/mock/users";

/**
 * Profile data access (users, follows, highlights).
 * TODO: replace with real data — query Supabase (`users`,
 * `user_onboarding_profiles`, `user_followers`, `lesson_highlights`).
 */

export async function getCurrentUser(): Promise<UserProfile> {
  return currentUser;
}

export async function getUserById(
  id: string,
): Promise<UserProfile | undefined> {
  return findUser(id);
}

export async function getLessonHighlights(): Promise<LessonHighlight[]> {
  return lessonHighlights;
}

export async function followUser(userId: string): Promise<void> {
  // TODO: replace with real data — insert into `user_followers`.
  void userId;
}

export async function unfollowUser(userId: string): Promise<void> {
  // TODO: replace with real data — delete from `user_followers`.
  void userId;
}
