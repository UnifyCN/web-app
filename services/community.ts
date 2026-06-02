import type {
  CircleStatus,
  CommunityCircle,
  CommunityEvent,
  Group,
  NewsItem,
  Persona,
  Stage,
} from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { groups as mockGroups, getGroupById as findMockGroup } from "@/lib/mock/groups";
import {
  events as communityEvents,
  getEventById as findCommunityEvent,
} from "@/lib/mock/events";
import { newsItems as mockNews } from "@/lib/mock/news";
import { currentCircle } from "@/lib/mock/circles";

/**
 * Community data access (groups, events, news, circles).
 * Real path queries Supabase (`groups`, `group_members`, `events`, `news_details`,
 * and the circle tables `community_match_waitlist` / `community_circle_members` /
 * `community_circles`). The circle UI status is derived (default → waiting →
 * in_circle); the matching engine, realtime, and chat surface are deferred (see
 * BACKLOG.md ## Community). requestGroup stays a no-op pending its edge function.
 * Falls back to mock when Supabase isn't configured or the user isn't signed in
 * (mirrors profile/checklist/feed).
 */

const AVATAR_SEED_PREFIX = "grp";

function seededMemberAvatars(id: number): string[] {
  return [1, 2, 3, 4].map(
    (n) => `https://picsum.photos/seed/${AVATAR_SEED_PREFIX}-${id}-m${n}/64/64`,
  );
}

interface GroupRow {
  id: number;
  group_name: string;
  group_description: string | null;
  member_count: number;
  cover_photo_url: string | null;
}

function rowToGroup(row: GroupRow, joinedByMe: boolean): Group {
  return {
    id: row.id,
    groupName: row.group_name,
    groupDescription: row.group_description ?? "",
    memberCount: row.member_count,
    coverPhotoUrl: row.cover_photo_url,
    joinedByMe,
    memberAvatars: seededMemberAvatars(row.id),
  };
}

async function fetchJoinedGroupIds(
  supabase: ReturnType<typeof createClient>,
  userId: string,
): Promise<Set<number>> {
  const { data, error } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);
  if (error) throw error;
  return new Set((data ?? []).map((row) => row.group_id as number));
}

export async function getGroups(): Promise<Group[]> {
  if (!isSupabaseConfigured()) return mockGroups;

  const userId = await getAuthUserId();
  if (!userId) return mockGroups;

  const supabase = createClient();
  const [groupsRes, joinedIds] = await Promise.all([
    supabase
      .from("groups")
      .select("id, group_name, group_description, member_count, cover_photo_url")
      .order("created_at", { ascending: false }),
    fetchJoinedGroupIds(supabase, userId),
  ]);
  if (groupsRes.error) throw groupsRes.error;

  return (groupsRes.data as GroupRow[]).map((row) =>
    rowToGroup(row, joinedIds.has(row.id)),
  );
}

export async function getGroupById(id: number): Promise<Group | undefined> {
  if (!isSupabaseConfigured()) return findMockGroup(id);

  const userId = await getAuthUserId();
  if (!userId) return findMockGroup(id);

  const supabase = createClient();
  const [groupRes, joinedIds] = await Promise.all([
    supabase
      .from("groups")
      .select("id, group_name, group_description, member_count, cover_photo_url")
      .eq("id", id)
      .maybeSingle(),
    fetchJoinedGroupIds(supabase, userId),
  ]);
  if (groupRes.error) throw groupRes.error;
  if (!groupRes.data) return undefined;

  return rowToGroup(groupRes.data as GroupRow, joinedIds.has(id));
}

export async function getJoinedGroups(): Promise<Group[]> {
  if (!isSupabaseConfigured()) {
    return mockGroups.filter((group) => group.joinedByMe);
  }

  const userId = await getAuthUserId();
  if (!userId) return mockGroups.filter((group) => group.joinedByMe);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("group_members")
    .select(
      "groups!inner(id, group_name, group_description, member_count, cover_photo_url)",
    )
    .eq("user_id", userId)
    .order("joined_at", { ascending: false });
  if (error) throw error;

  return (data ?? [])
    .map((row) => (row as unknown as { groups: GroupRow }).groups)
    .filter(Boolean)
    .map((groupRow) => rowToGroup(groupRow, true));
}

export async function joinGroup(groupId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("joinGroup: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .insert({ user_id: userId, group_id: groupId });
  // (user_id, group_id) is the composite PK; duplicate insert = already joined,
  // treat as idempotent success.
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function leaveGroup(groupId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("leaveGroup: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("group_members")
    .delete()
    .eq("user_id", userId)
    .eq("group_id", groupId);
  if (error) throw error;
}

/* ---- Events ----------------------------------------------------------- */

// Events are hard-coded (no events-management surface on web) — the canonical
// list lives in lib/mock/events.ts and is returned in every environment;
// Supabase is not consulted. Past events are filtered out (only upcoming show),
// then ordered newest-first to mirror the old query.

export async function getEvents(): Promise<CommunityEvent[]> {
  const now = new Date();
  return [...communityEvents]
    .filter((event) => new Date(event.eventDatetime) > now)
    .sort((a, b) => b.eventDatetime.localeCompare(a.eventDatetime));
}

export async function getEventById(
  id: number,
): Promise<CommunityEvent | undefined> {
  return findCommunityEvent(id);
}

/* ---- News ------------------------------------------------------------- */

interface NewsRow {
  id: number;
  title: string;
  description: string | null;
  author: string | null;
  category: string | null;
  date: string;
  image_link: string | null;
  link: string | null;
}

function rowToNews(row: NewsRow): NewsItem {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    author: row.author,
    date: row.date,
    category: row.category,
    imageLink: row.image_link,
    link: row.link,
  };
}

export async function getNews(): Promise<NewsItem[]> {
  if (!isSupabaseConfigured()) return mockNews;

  const userId = await getAuthUserId();
  if (!userId) return mockNews;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("news_details")
    .select("id, title, description, author, category, date, image_link, link")
    .order("date", { ascending: false });
  if (error) throw error;

  return (data as NewsRow[]).map(rowToNews);
}

/* ---- Circles ---------------------------------------------------------- */

// Web Stage (0-4) → mobile pool-key time slug. Distinct from checklist's
// STAGE_TO_SLUG (Sanity vocabulary) — do not reuse. The mapping is non-1:1
// (stages 1 & 2 both collapse to less_than_1_year); confirm with mobile before
// any cross-DB pooling, since pool_key equality is the pairing key.
const STAGE_TO_TIME_SLUG: Record<Stage, string> = {
  0: "not_arrived",
  1: "less_than_1_year",
  2: "less_than_1_year",
  3: "1_to_2_years",
  4: "3_plus_years",
};

function buildPoolKey(persona: Persona, stage: Stage): string {
  return `${persona}__${STAGE_TO_TIME_SLUG[stage]}`;
}

interface WaitlistRow {
  id: string;
  persona: Persona;
  time_in_canada: number;
  goal: string | null;
  topics: string[] | null;
}

interface CircleRow {
  id: string;
  persona: Persona;
  time_in_canada: number;
  goal: string | null;
  topics: string[] | null;
  status: string;
  ends_at: string | null;
}

function rowToCircle(row: CircleRow, status: CircleStatus): CommunityCircle {
  return {
    id: row.id,
    persona: row.persona,
    timeInCanada: row.time_in_canada as Stage,
    goal: row.goal ?? "",
    topics: row.topics ?? [],
    status,
    endsAt: row.ends_at,
  };
}

/**
 * Derive the user's circle state for the EntryCard. Priority mirrors mobile
 * routing: an active circle membership wins (in_circle), else a waiting
 * waitlist row (waiting), else a default seeded from the onboarding profile.
 */
export async function getCurrentCircle(): Promise<CommunityCircle> {
  if (!isSupabaseConfigured()) return currentCircle;

  const userId = await getAuthUserId();
  if (!userId) return currentCircle;

  const supabase = createClient();

  // (a) Active circle membership → in_circle.
  const { data: memberRows, error: memberErr } = await supabase
    .from("community_circle_members")
    .select(
      "community_circles!inner(id, persona, time_in_canada, goal, topics, status, ends_at)",
    )
    .eq("user_id", userId)
    .is("left_at", null)
    .eq("community_circles.status", "active")
    .order("joined_at", { ascending: false })
    .limit(1);
  if (memberErr) throw memberErr;
  const circleRow = (
    memberRows?.[0] as unknown as { community_circles: CircleRow } | undefined
  )?.community_circles;
  if (circleRow) return rowToCircle(circleRow, "in_circle");

  // (b) Waiting on the matching waitlist → waiting.
  const { data: waitRow, error: waitErr } = await supabase
    .from("community_match_waitlist")
    .select("id, persona, time_in_canada, goal, topics")
    .eq("user_id", userId)
    .eq("status", "waiting")
    .maybeSingle();
  if (waitErr) throw waitErr;
  if (waitRow) {
    const w = waitRow as WaitlistRow;
    return {
      id: w.id,
      persona: w.persona,
      timeInCanada: w.time_in_canada as Stage,
      goal: w.goal ?? "",
      topics: w.topics ?? [],
      status: "waiting",
      endsAt: null,
    };
  }

  // (c) Not matched and not waiting → default, seeded from onboarding so the
  // join card reflects the user's own persona/stage.
  const { data: onboarding } = await supabase
    .from("user_onboarding_profiles")
    .select("persona, stage, goals, learning_interests")
    .eq("id", userId)
    .maybeSingle();
  if (!onboarding) return currentCircle;

  return {
    id: "default",
    persona: onboarding.persona as Persona,
    timeInCanada: onboarding.stage as Stage,
    goal: (onboarding.goals as string[] | null)?.[0] ?? "",
    topics: (onboarding.learning_interests as string[] | null) ?? [],
    status: "default",
    endsAt: null,
  };
}

/**
 * Opt into matching by inserting a waiting waitlist row. Persona/stage/goal/
 * topics are derived from the onboarding profile (no separate picker this
 * round). Idempotent: a second call while already waiting hits the partial
 * unique index (uq_waitlist_user_waiting) and is treated as success.
 */
export async function startCircleMatching(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("startCircleMatching: no auth session");

  const supabase = createClient();

  // Already in an active circle → don't re-enqueue. The UI hides the start
  // button for in_circle users, but the service is directly callable.
  const { data: activeMembership, error: memberErr } = await supabase
    .from("community_circle_members")
    .select("id, community_circles!inner(status)")
    .eq("user_id", userId)
    .is("left_at", null)
    .eq("community_circles.status", "active")
    .limit(1);
  if (memberErr) throw memberErr;
  if (activeMembership && activeMembership.length > 0) {
    throw new Error("startCircleMatching: already in an active circle");
  }

  const { data: onboarding, error: obError } = await supabase
    .from("user_onboarding_profiles")
    .select("persona, stage, goals, learning_interests")
    .eq("id", userId)
    .maybeSingle();
  if (obError) throw obError;
  if (!onboarding) {
    throw new Error("startCircleMatching: complete onboarding first");
  }

  const persona = onboarding.persona as Persona;
  const stage = onboarding.stage as Stage;

  const { error } = await supabase.from("community_match_waitlist").insert({
    user_id: userId,
    persona,
    time_in_canada: stage,
    pool_key: buildPoolKey(persona, stage),
    goal: (onboarding.goals as string[] | null)?.[0] ?? null,
    topics: (onboarding.learning_interests as string[] | null) ?? [],
    // placement_deadline_at is owned by the (deferred) matching engine.
  });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

/** Cancel matching by removing the user's waiting waitlist row. */
export async function cancelCircleMatching(): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const userId = await getAuthUserId();
  if (!userId) throw new Error("cancelCircleMatching: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("community_match_waitlist")
    .delete()
    .eq("user_id", userId)
    .eq("status", "waiting");
  if (error) throw error;
}

/* ---- Mock-only surfaces (deferred) ----------------------------------- */

export interface GroupRequest {
  groupName: string;
  audience: string;
  reason: string;
  email: string;
  notes: string;
}

export async function requestGroup(payload: GroupRequest): Promise<void> {
  // requestGroup edge function is deferred — see BACKLOG ## Community.
  void payload;
}
