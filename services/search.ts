import type { Group, Post } from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { ilikeContains, SEARCH_USERS_LIMIT } from "@/lib/search";
import { currentUser, otherUsers } from "@/lib/mock/users";
import { getBlockedUserIds } from "./moderation";
import { searchPosts } from "./feed";
import { searchGroups } from "./community";

/**
 * Social search (posts / people / groups), a port of the mobile app's
 * `app/search.tsx`. Each section reuses mobile's query shape; see
 * `searchPosts` (feed.ts) and `searchGroups` (community.ts). Falls back to
 * mock data when Supabase isn't configured or the user isn't signed in.
 */

export interface SearchPerson {
  id: string;
  username: string;
  firstName: string | null;
  profilePictureUrl: string | null;
}

export interface SocialSearchResults {
  posts: Post[];
  people: SearchPerson[];
  groups: Group[];
}

interface SearchUserRow {
  id: string;
  username: string;
  first_name: string | null;
  profile_picture_url: string | null;
}

/**
 * Social search → People. Matches `username` (mobile's query) or `first_name`
 * only, never any other column. Username matches come first; accounts the
 * caller has blocked are left out, like the web feeds.
 */
export async function searchUsers(term: string): Promise<SearchPerson[]> {
  const needle = term.toLowerCase();
  const userId = isSupabaseConfigured() ? await getAuthUserId() : null;
  if (!userId) {
    return [currentUser, ...otherUsers]
      .filter(
        (user) =>
          user.username.toLowerCase().includes(needle) ||
          (user.onboarding?.firstName ?? "").toLowerCase().includes(needle),
      )
      .map((user) => ({
        id: user.id,
        username: user.username,
        firstName: user.onboarding?.firstName ?? null,
        profilePictureUrl: user.profilePictureUrl,
      }));
  }

  const supabase = createClient();
  const pattern = ilikeContains(term);
  const byColumn = (column: "username" | "first_name") =>
    supabase
      .from("users")
      .select("id, username, first_name, profile_picture_url")
      .ilike(column, pattern)
      .order("username", { ascending: true })
      .limit(SEARCH_USERS_LIMIT);
  const [byUsername, byFirstName, blocked] = await Promise.all([
    byColumn("username"),
    byColumn("first_name"),
    getBlockedUserIds(),
  ]);
  if (byUsername.error) throw byUsername.error;
  if (byFirstName.error) throw byFirstName.error;

  const blockedSet = new Set(blocked);
  const unique = new Map<string, SearchUserRow>();
  for (const row of [
    ...(byUsername.data as SearchUserRow[]),
    ...(byFirstName.data as SearchUserRow[]),
  ]) {
    if (!blockedSet.has(row.id) && !unique.has(row.id)) unique.set(row.id, row);
  }
  return [...unique.values()].slice(0, SEARCH_USERS_LIMIT).map((row) => ({
    id: row.id,
    username: row.username,
    firstName: row.first_name,
    profilePictureUrl: row.profile_picture_url,
  }));
}

/** All three sections for one search term, fetched in parallel. */
export async function searchSocial(term: string): Promise<SocialSearchResults> {
  const [posts, people, groups] = await Promise.all([
    searchPosts(term),
    searchUsers(term),
    searchGroups(term),
  ]);
  return { posts, people, groups };
}
