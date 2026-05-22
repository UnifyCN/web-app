import type { Persona, Stage, UserProfile } from "@/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ensureUserRow } from "@/lib/supabase/ensureUserRow";
import {
  currentUser,
  getUserById as findUser,
  lessonHighlights,
  type LessonHighlight,
} from "@/lib/mock/users";

/**
 * Profile data access (users, follows, highlights).
 * TODO: replace with real data — follows and highlights are still mock; only
 * the signed-in user's profile is wired to Supabase.
 */

export async function getCurrentUser(): Promise<UserProfile | null> {
  // Until the project env vars are set, serve mock so the app stays browsable.
  if (!isSupabaseConfigured()) return currentUser;

  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    console.warn("getCurrentUser: no auth session");
    return null;
  }

  const usersSelect = "id, username, profile_picture_url, is_premium, permissions";

  const [usersRes, { data: onb }, followerRes, followingRes] = await Promise.all([
    supabase.from("users").select(usersSelect).eq("id", user.id).maybeSingle(),
    supabase
      .from("user_onboarding_profiles")
      .select(
        "id, persona, arrival_date, city, province, stage, goals, learning_interests",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("user_followers")
      .select("*", { count: "exact", head: true })
      .eq("following_id", user.id),
    supabase
      .from("user_followers")
      .select("*", { count: "exact", head: true })
      .eq("follower_id", user.id),
  ]);

  let row = usersRes.data;
  let rowError = usersRes.error;

  // Self-heal: a signed-in user with no public.users row (e.g. signed up before
  // the trigger/backfill existed) gets one created now, then we re-read it.
  if (!row && !rowError) {
    await ensureUserRow(supabase, user);
    const retry = await supabase
      .from("users")
      .select(usersSelect)
      .eq("id", user.id)
      .maybeSingle();
    row = retry.data;
    rowError = retry.error;
  }

  if (!row) {
    if (rowError) console.error("getCurrentUser: users query failed", rowError);
    else console.warn("getCurrentUser: no public.users row for", user.id);
    return null;
  }

  return {
    id: row.id,
    username: row.username,
    profilePictureUrl: row.profile_picture_url,
    isPremium: row.is_premium,
    permissions: row.permissions ? [row.permissions] : [],
    followerCount: followerRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    onboarding: onb
      ? {
          id: onb.id,
          persona: onb.persona as Persona,
          arrivalDate: onb.arrival_date,
          city: onb.city,
          province: onb.province,
          stage: onb.stage as Stage,
          goals: onb.goals ?? [],
          learningInterests: onb.learning_interests ?? [],
        }
      : null,
  };
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
