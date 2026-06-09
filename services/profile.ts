import type { FollowListUser, Persona, Stage, UserProfile } from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  MODULES_LIST_QUERY,
  isSanityConfigured,
  sanityClient,
} from "@/lib/sanity";
import { ensureUserRow } from "@/lib/supabase/ensureUserRow";
import { AVATARS_BUCKET, uploadImage } from "@/lib/supabase/uploadImage";
import {
  PLACEHOLDER_RE,
  claimUsername,
  generateUsernameBase,
} from "@/lib/supabase/username";
import {
  currentUser,
  getUserById as findUser,
  lessonHighlights,
  otherUsers,
  type LessonHighlight,
} from "@/lib/mock/users";

/**
 * Profile data access (users, follows, highlights).
 *
 * Own + other-user profiles and the follow graph (user_followers) read the real
 * Supabase tables; the mock users + highlights remain the env-not-configured
 * fallback for local dev. NOTE: user_onboarding_profiles is own-row RLS, so a
 * fetched *other* user's `onboarding` comes back null (persona / city / stage
 * won't render) until a public-profile read path exists.
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

  const usersSelect =
    "id, username, profile_picture_url, is_premium, permissions, biography, pronouns, created_at";

  const [usersRes, { data: onb }, followerRes, followingRes] = await Promise.all([
    supabase.from("users").select(usersSelect).eq("id", user.id).maybeSingle(),
    supabase
      .from("user_onboarding_profiles")
      .select(
        "id, first_name, persona, referral_source, arrival_date, city, province, stage, goals, learning_interests, hobbies, learning_reminders",
      )
      .eq("id", user.id)
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

  // Self-heal legacy placeholder usernames (`user <uuid>`) → a friendly handle
  // derived from the Google name, so every surface shows the same display name.
  let username = row.username;
  if (PLACEHOLDER_RE.test(username)) {
    const healed = await claimUsername(
      supabase,
      user.id,
      generateUsernameBase(user),
    );
    if (healed) username = healed;
  }

  return {
    id: row.id,
    username,
    profilePictureUrl: row.profile_picture_url,
    isPremium: row.is_premium,
    permissions: row.permissions ? [row.permissions] : [],
    bio: row.biography ?? null,
    pronouns: row.pronouns ?? null,
    createdAt: row.created_at ?? null,
    followerCount: followerRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    onboarding: onb
      ? {
          id: onb.id,
          firstName: onb.first_name ?? null,
          persona: onb.persona as Persona,
          referralSource: onb.referral_source ?? null,
          arrivalDate: onb.arrival_date,
          city: onb.city,
          province: onb.province,
          stage: onb.stage as Stage,
          goals: onb.goals ?? [],
          learningInterests: onb.learning_interests ?? [],
          hobbies: onb.hobbies ?? [],
          learningReminders: onb.learning_reminders ?? false,
        }
      : null,
  };
}

export async function getUserById(
  id: string,
): Promise<UserProfile | undefined> {
  // Local-dev / env-not-configured: serve the mock user so the app stays
  // browsable without Supabase.
  if (!isSupabaseConfigured()) return findUser(id);

  const supabase = createClient();

  const usersSelect =
    "id, username, profile_picture_url, is_premium, permissions, biography, pronouns, created_at";

  const [usersRes, { data: onb }, followerRes, followingRes] =
    await Promise.all([
      supabase.from("users").select(usersSelect).eq("id", id).maybeSingle(),
      // user_onboarding_profiles is own-row RLS, so this returns null for any
      // user other than the caller — onboarding fields degrade to absent.
      supabase
        .from("user_onboarding_profiles")
        .select(
          "id, first_name, persona, referral_source, arrival_date, city, province, stage, goals, learning_interests, hobbies, learning_reminders",
        )
        .eq("id", id)
        .maybeSingle(),
      supabase
        .from("user_followers")
        .select("*", { count: "exact", head: true })
        .eq("following_id", id),
      supabase
        .from("user_followers")
        .select("*", { count: "exact", head: true })
        .eq("follower_id", id),
    ]);

  const row = usersRes.data;
  if (!row) {
    if (usersRes.error) {
      console.error("getUserById: users query failed", usersRes.error);
    }
    return undefined;
  }

  return {
    id: row.id,
    username: row.username,
    profilePictureUrl: row.profile_picture_url,
    isPremium: row.is_premium,
    permissions: row.permissions ? [row.permissions] : [],
    bio: row.biography ?? null,
    pronouns: row.pronouns ?? null,
    createdAt: row.created_at ?? null,
    followerCount: followerRes.count ?? 0,
    followingCount: followingRes.count ?? 0,
    onboarding: onb
      ? {
          id: onb.id,
          firstName: onb.first_name ?? null,
          persona: onb.persona as Persona,
          referralSource: onb.referral_source ?? null,
          arrivalDate: onb.arrival_date,
          city: onb.city,
          province: onb.province,
          stage: onb.stage as Stage,
          goals: onb.goals ?? [],
          learningInterests: onb.learning_interests ?? [],
          hobbies: onb.hobbies ?? [],
          learningReminders: onb.learning_reminders ?? false,
        }
      : null,
  };
}

export interface UpdateUserDetailsInput {
  bio?: string;
  pronouns?: string;
}

/**
 * Update the signed-in user's free-text profile fields (bio + pronouns) on the
 * own-row `users` table. Empty strings clear the column. No-op in the mock /
 * env-not-configured build so the editor stays exercisable locally.
 */
export async function updateUserDetails(
  input: UpdateUserDetailsInput,
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateUserDetails: no auth session");

  const patch: { biography?: string | null; pronouns?: string | null } = {};
  if (input.bio !== undefined) patch.biography = input.bio.trim() || null;
  if (input.pronouns !== undefined) {
    patch.pronouns = input.pronouns.trim() || null;
  }
  if (Object.keys(patch).length === 0) return;

  const { error } = await supabase.from("users").update(patch).eq("id", userId);
  if (error) throw error;
}

/** Extract the storage object path ("<uid>/<file>") from an avatar public URL. */
function avatarPathFromUrl(url: string | null): string | null {
  if (!url) return null;
  const marker = `/${AVATARS_BUCKET}/`;
  const idx = url.indexOf(marker);
  return idx === -1 ? null : url.slice(idx + marker.length);
}

/**
 * Upload a new avatar to the public `avatars` bucket and store its URL on the
 * signed-in user's row. Returns the public URL (null in the mock build).
 */
export async function updateAvatar(file: File): Promise<string | null> {
  if (!isSupabaseConfigured()) return null;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("updateAvatar: no auth session");

  const url = await uploadImage(file, AVATARS_BUCKET, userId);

  const supabase = createClient();
  const { error } = await supabase
    .from("users")
    .update({ profile_picture_url: url })
    .eq("id", userId);
  if (error) throw error;

  return url;
}

/**
 * Clear the signed-in user's avatar: best-effort delete of the stored object,
 * then null out `profile_picture_url`. No-op in the mock build.
 */
export async function removeAvatar(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("removeAvatar: no auth session");

  const { data: row } = await supabase
    .from("users")
    .select("profile_picture_url")
    .eq("id", userId)
    .maybeSingle();
  const path = avatarPathFromUrl(row?.profile_picture_url ?? null);
  if (path) await supabase.storage.from(AVATARS_BUCKET).remove([path]);

  const { error } = await supabase
    .from("users")
    .update({ profile_picture_url: null })
    .eq("id", userId);
  if (error) throw error;
}

/** Slice of the Sanity module tree we need to title a highlight. */
interface HighlightModuleRow {
  _id: string;
  title: string;
  submodules:
    | { _id: string; title: string; lessons: { _id: string; title: string }[] | null }[]
    | null;
}

/**
 * The signed-in user's lesson highlights, newest first. Reads the own-row
 * `lesson_highlights` table (selected_text + Sanity lesson id) and resolves
 * each lesson_id to its lesson + module title from the Sanity module tree.
 * Falls back to mock highlights when Supabase/Sanity aren't configured.
 */
export async function getLessonHighlights(): Promise<LessonHighlight[]> {
  if (!isSupabaseConfigured()) return lessonHighlights;

  const userId = await getAuthUserId();
  if (!userId) return lessonHighlights;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("lesson_highlights")
    .select("id, lesson_id, selected_text")
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    lesson_id: string;
    selected_text: string;
  }[];
  if (rows.length === 0) return [];

  // Build lesson_id -> { lessonTitle, moduleTitle } from the Sanity module tree.
  const titleByLessonId = new Map<
    string,
    { lessonTitle: string; moduleTitle: string }
  >();
  if (isSanityConfigured()) {
    const modules =
      await sanityClient.fetch<HighlightModuleRow[]>(MODULES_LIST_QUERY);
    for (const mod of modules ?? []) {
      for (const sub of mod.submodules ?? []) {
        for (const lesson of sub.lessons ?? []) {
          titleByLessonId.set(lesson._id, {
            lessonTitle: lesson.title,
            moduleTitle: mod.title,
          });
        }
      }
    }
  }

  return rows.map((row) => {
    const resolved = titleByLessonId.get(row.lesson_id);
    return {
      id: row.id,
      text: row.selected_text,
      lessonTitle: resolved?.lessonTitle ?? "Unknown lesson",
      moduleTitle: resolved?.moduleTitle ?? "Unknown module",
    };
  });
}

/* ---- follow graph ----------------------------------------------------- */

/** Whether the signed-in user follows `userId`. False in the mock / signed-out
 *  build (the follow graph isn't available without an auth session). */
export async function getFollowStatus(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const me = await getAuthUserId();
  if (!me) return false;

  const supabase = createClient();
  const { count, error } = await supabase
    .from("user_followers")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", me)
    .eq("following_id", userId);
  if (error) throw error;
  return (count ?? 0) > 0;
}

/** Whether `userId` follows the signed-in user back (drives the "Follows you"
 *  badge). False in the mock / signed-out build. */
export async function getFollowsYou(userId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  const me = await getAuthUserId();
  if (!me) return false;

  const supabase = createClient();
  const { count, error } = await supabase
    .from("user_followers")
    .select("*", { count: "exact", head: true })
    .eq("follower_id", userId)
    .eq("following_id", me);
  if (error) throw error;
  return (count ?? 0) > 0;
}

export async function followUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const me = await getAuthUserId();
  if (!me) throw new Error("followUser: no auth session");

  const supabase = createClient();
  // (follower_id, following_id) is the composite PK — a duplicate insert just
  // means we already follow them, so treat 23505 as idempotent success.
  const { error } = await supabase
    .from("user_followers")
    .insert({ follower_id: me, following_id: userId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unfollowUser(userId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const me = await getAuthUserId();
  if (!me) throw new Error("unfollowUser: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("user_followers")
    .delete()
    .eq("follower_id", me)
    .eq("following_id", userId);
  if (error) throw error;
}

/** One user_followers row with the joined user embedded under `follower` or
 *  `following` (whichever side the query selected). */
interface FollowJoinRow {
  follower?: FollowJoinUser | FollowJoinUser[] | null;
  following?: FollowJoinUser | FollowJoinUser[] | null;
}
interface FollowJoinUser {
  id: string;
  username: string;
  profile_picture_url: string | null;
}

/** Pull the embedded user off each follow row and map it to FollowListUser.
 *  PostgREST returns the to-one embed as an object, but we accept an array too
 *  to stay resilient to relationship-inference quirks. */
function mapFollowRows(
  data: unknown,
  key: "follower" | "following",
): FollowListUser[] {
  const rows = (data ?? []) as FollowJoinRow[];
  return rows
    .map((row) => {
      const embedded = row[key];
      return Array.isArray(embedded) ? (embedded[0] ?? null) : embedded ?? null;
    })
    .filter((user): user is FollowJoinUser => user !== null)
    .map((user) => ({
      id: user.id,
      username: user.username,
      profilePictureUrl: user.profile_picture_url,
    }));
}

/** Mock follow list — every other mock user except the profile being viewed. */
function mockFollowList(userId: string): FollowListUser[] {
  return otherUsers
    .filter((user) => user.id !== userId)
    .map((user) => ({
      id: user.id,
      username: user.username,
      profilePictureUrl: user.profilePictureUrl,
    }));
}

/** Users who follow `userId`, newest first. The graph is public-read RLS so it
 *  works for any profile; falls back to mock users pre-config. */
export async function getFollowers(userId: string): Promise<FollowListUser[]> {
  if (!isSupabaseConfigured()) return mockFollowList(userId);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_followers")
    .select(
      "created_at, follower:users!follower_id (id, username, profile_picture_url)",
    )
    .eq("following_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return mapFollowRows(data, "follower");
}

/** Users `userId` follows, newest first. Mock fallback pre-config. */
export async function getFollowing(userId: string): Promise<FollowListUser[]> {
  if (!isSupabaseConfigured()) return mockFollowList(userId);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("user_followers")
    .select(
      "created_at, following:users!following_id (id, username, profile_picture_url)",
    )
    .eq("follower_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return mapFollowRows(data, "following");
}
