import type { CommunityCircle, CommunityEvent, EventType, Group, NewsItem } from "@/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { groups as mockGroups, getGroupById as findMockGroup } from "@/lib/mock/groups";
import { events as mockEvents, getEventById as findMockEvent } from "@/lib/mock/events";
import { newsItems as mockNews } from "@/lib/mock/news";
import { currentCircle } from "@/lib/mock/circles";

/**
 * Community data access (groups, events, news, circles).
 * Real path queries Supabase (`groups`, `group_members`, `events`, `news_details`).
 * Circles and requestGroup stay mock for now — see BACKLOG.md for the deferred
 * edge function. Falls back to mock when Supabase isn't configured or the user
 * isn't signed in (mirrors profile/checklist/feed).
 */

const AVATAR_SEED_PREFIX = "grp";

function seededMemberAvatars(id: number): string[] {
  return [1, 2, 3, 4].map(
    (n) => `https://picsum.photos/seed/${AVATAR_SEED_PREFIX}-${id}-m${n}/64/64`,
  );
}

async function getAuthUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
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

interface EventRow {
  id: number;
  title: string;
  description: string | null;
  event_datetime: string;
  event_end_datetime: string | null;
  location: string;
  hosted_by: string | null;
  event_type: EventType;
  cover_photo_url: string | null;
  external_link: string | null;
}

function rowToEvent(row: EventRow): CommunityEvent {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? "",
    eventDatetime: row.event_datetime,
    eventEndDatetime: row.event_end_datetime ?? undefined,
    location: row.location,
    eventType: row.event_type,
    coverPhotoUrl: row.cover_photo_url,
    externalLink: row.external_link,
    hostedBy: row.hosted_by,
  };
}

export async function getEvents(): Promise<CommunityEvent[]> {
  if (!isSupabaseConfigured()) return mockEvents;

  const userId = await getAuthUserId();
  if (!userId) return mockEvents;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, event_datetime, event_end_datetime, location, hosted_by, event_type, cover_photo_url, external_link",
    )
    .order("event_datetime", { ascending: false });
  if (error) throw error;

  return (data as EventRow[]).map(rowToEvent);
}

export async function getEventById(
  id: number,
): Promise<CommunityEvent | undefined> {
  if (!isSupabaseConfigured()) return findMockEvent(id);

  const userId = await getAuthUserId();
  if (!userId) return findMockEvent(id);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("events")
    .select(
      "id, title, description, event_datetime, event_end_datetime, location, hosted_by, event_type, cover_photo_url, external_link",
    )
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
  };
}

export async function getNews(): Promise<NewsItem[]> {
  if (!isSupabaseConfigured()) return mockNews;

  const userId = await getAuthUserId();
  if (!userId) return mockNews;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("news_details")
    .select("id, title, description, author, category, date, image_link")
    .order("date", { ascending: false });
  if (error) throw error;

  return (data as NewsRow[]).map(rowToNews);
}

/* ---- Mock-only surfaces (deferred) ----------------------------------- */

export async function getCurrentCircle(): Promise<CommunityCircle> {
  // Circles wiring is deferred — see BACKLOG ## Community.
  return currentCircle;
}

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
