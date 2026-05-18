import type { CommunityCircle, CommunityEvent, Group, NewsItem } from "@/types";
import { groups, getGroupById as findGroup } from "@/lib/mock/groups";
import { events, getEventById as findEvent } from "@/lib/mock/events";
import { newsItems } from "@/lib/mock/news";
import { currentCircle } from "@/lib/mock/circles";

/**
 * Community data access (groups, events, news, circles).
 * TODO: replace with real data — query Supabase (`groups`, `group_members`,
 * `events`, `news_details`, `community_circles`).
 */

export async function getGroups(): Promise<Group[]> {
  return groups;
}

export async function getGroupById(id: string): Promise<Group | undefined> {
  return findGroup(id);
}

export async function getJoinedGroups(): Promise<Group[]> {
  return groups.filter((group) => group.joinedByMe);
}

export async function joinGroup(groupId: string): Promise<void> {
  // TODO: replace with real data — insert/delete in `group_members`.
  void groupId;
}

export async function getEvents(): Promise<CommunityEvent[]> {
  return events;
}

export async function getEventById(
  id: string,
): Promise<CommunityEvent | undefined> {
  return findEvent(id);
}

export async function getNews(): Promise<NewsItem[]> {
  return newsItems;
}

export async function getCurrentCircle(): Promise<CommunityCircle> {
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
  // TODO: replace with real data — call the group-request edge function.
  void payload;
}
