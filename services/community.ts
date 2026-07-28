import type {
  CircleStatus,
  CommunityCircle,
  CommunityEvent,
  EventGenre,
  Group,
  GroupMemberAvatar,
  NewsItem,
  Persona,
  Stage,
} from "@/types";
import { EVENT_GENRES } from "@/types";
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
    // Populated only on the detail path (getGroupById); list rows don't render
    // the avatar stack.
    memberAvatars: [],
  };
}

interface GroupMemberRow {
  users: { username: string; profile_picture_url: string | null } | null;
}

/**
 * Up to a handful of a group's members for the avatar stack, members with a
 * real profile picture first (the stack shows the first 4). `profile_picture_url`
 * is a storage object key resolved to a signed URL at render time by `Avatar`.
 */
async function fetchGroupMemberAvatars(
  supabase: ReturnType<typeof createClient>,
  groupId: number,
): Promise<GroupMemberAvatar[]> {
  const { data, error } = await supabase
    .from("group_members")
    .select("users!user_id ( username, profile_picture_url )")
    .eq("group_id", groupId)
    .limit(12);
  if (error) throw error;

  return (data ?? [])
    .map((row) => (row as unknown as GroupMemberRow).users)
    .filter((user): user is NonNullable<GroupMemberRow["users"]> =>
      Boolean(user),
    )
    .map((user) => ({
      username: user.username,
      profilePictureUrl: user.profile_picture_url,
    }))
    .sort(
      (a, b) =>
        Number(Boolean(b.profilePictureUrl)) -
        Number(Boolean(a.profilePictureUrl)),
    )
    .slice(0, 6);
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
  const [groupRes, joinedIds, memberAvatars] = await Promise.all([
    supabase
      .from("groups")
      .select("id, group_name, group_description, member_count, cover_photo_url")
      .eq("id", id)
      .maybeSingle(),
    fetchJoinedGroupIds(supabase, userId),
    fetchGroupMemberAvatars(supabase, id),
  ]);
  if (groupRes.error) throw groupRes.error;
  if (!groupRes.data) return undefined;

  const group = rowToGroup(groupRes.data as GroupRow, joinedIds.has(id));
  group.memberAvatars = memberAvatars;
  return group;
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

// Events are read from the shared `events` table (manual rows entered by the team
// plus rows auto-populated by the events-crawler edge function). Falls back to the
// lib/mock/events.ts snapshot when Supabase isn't configured or the user isn't
// signed in (mirrors getNews). Only events inside the rolling window show, soonest
// first.

/**
 * How far ahead the Events tab looks. Events further out than this are hidden rather
 * than deleted — the crawler already declines to ingest them (WINDOW_MONTHS in
 * supabase/functions/events-crawler/index.ts, keep the two in step), and the shared
 * table is also read by mobile, which has no date filter and a Past tab. So rows that
 * fall out of the window simply stop matching here.
 */
export const EVENTS_WINDOW_MONTHS = 4;

function windowEnd(from: Date = new Date()): Date {
  const end = new Date(from);
  end.setMonth(end.getMonth() + EVENTS_WINDOW_MONTHS);
  return end;
}

interface EventRow {
  id: number;
  title: string;
  description: string | null;
  event_datetime: string;
  event_end_datetime: string | null;
  location: string;
  event_type: string;
  cover_photo_url: string | null;
  external_link: string | null;
  hosted_by: string | null;
  genre: string | null;
}

const EVENT_COLUMNS =
  "id, title, description, event_datetime, event_end_datetime, location, event_type, cover_photo_url, external_link, hosted_by, genre";

function rowToEvent(row: EventRow): CommunityEvent {
  return {
    id: row.id,
    title: row.title,
    eventDatetime: row.event_datetime,
    eventEndDatetime: row.event_end_datetime ?? undefined,
    location: row.location,
    eventType: row.event_type as CommunityEvent["eventType"],
    coverPhotoUrl: row.cover_photo_url,
    externalLink: row.external_link,
    description: row.description ?? "",
    hostedBy: row.hosted_by,
    genre: normalizeGenre(row.genre),
  };
}

/**
 * `genre` is free text on the shared table, so an unrecognised value (a hand-entered
 * row, or a tag mobile adds later) must not become a filter chip the UI can't label.
 * Anything off the known list reads as Uncategorized.
 */
function normalizeGenre(value: string | null): EventGenre {
  return EVENT_GENRES.includes(value as EventGenre)
    ? (value as EventGenre)
    : "Uncategorized";
}

function inWindowSortedAsc(list: CommunityEvent[]): CommunityEvent[] {
  const now = new Date();
  const end = windowEnd(now);
  return list
    .filter((event) => {
      const at = new Date(event.eventDatetime);
      return at > now && at < end;
    })
    .sort((a, b) => a.eventDatetime.localeCompare(b.eventDatetime));
}

export async function getEvents(): Promise<CommunityEvent[]> {
  if (!isSupabaseConfigured()) return inWindowSortedAsc([...communityEvents]);

  const userId = await getAuthUserId();
  if (!userId) return inWindowSortedAsc([...communityEvents]);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .gt("event_datetime", new Date().toISOString())
    .lt("event_datetime", windowEnd().toISOString())
    .order("event_datetime", { ascending: true });
  if (error) throw error;

  return (data as EventRow[]).map(rowToEvent);
}

/**
 * Deliberately NOT window-filtered, unlike getEvents. The 4-month window is a
 * discovery bound on the list, not access control: this is a lookup by an id the
 * caller already holds (a shared link, or a card that was in-window when it
 * rendered). Applying the window here would turn a valid link into a spurious
 * "event not found". The list is the only surface that can grow unbounded, and it
 * is bounded.
 */
export async function getEventById(
  id: number,
): Promise<CommunityEvent | undefined> {
  if (!isSupabaseConfigured()) return findCommunityEvent(id);

  const userId = await getAuthUserId();
  if (!userId) return findCommunityEvent(id);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select(EVENT_COLUMNS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;

  return data ? rowToEvent(data as EventRow) : undefined;
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

// Reverse of STAGE_TO_TIME_SLUG for reading mobile's text slug back into a web
// Stage. Lossy (both sub-year stages collapse to less_than_1_year; the two
// multi-year slugs both map to stage 3); unknown slugs fall back to 0.
const TIME_SLUG_TO_STAGE: Record<string, Stage> = {
  not_arrived: 0,
  less_than_1_year: 1,
  "1_to_2_years": 3,
  "2_to_3_years": 3,
  "3_plus_years": 4,
};

function buildPoolKey(persona: Persona, stage: Stage): string {
  return `${persona}__${STAGE_TO_TIME_SLUG[stage]}`;
}

interface WaitlistRow {
  id: string;
  persona: Persona;
  time_in_canada: string;
  goal: string | null;
  topics: string[] | null;
}

interface CircleRow {
  id: string;
  persona: Persona;
  time_in_canada: string;
  goal: string | null;
  topics: string[] | null;
  status: string;
  ends_at: string | null;
}

function rowToCircle(row: CircleRow, status: CircleStatus): CommunityCircle {
  return {
    id: row.id,
    persona: row.persona,
    timeInCanada: TIME_SLUG_TO_STAGE[row.time_in_canada] ?? 0,
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
      timeInCanada: TIME_SLUG_TO_STAGE[w.time_in_canada] ?? 0,
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
    time_in_canada: STAGE_TO_TIME_SLUG[stage],
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
