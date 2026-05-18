import { useQuery, useMutation } from "@tanstack/react-query";
import * as community from "@/services/community";

/** React Query hooks for Community data (groups, events, news, circles). */

export function useGroups() {
  return useQuery({ queryKey: ["groups"], queryFn: community.getGroups });
}

export function useGroup(id: string) {
  return useQuery({
    queryKey: ["groups", id],
    queryFn: () => community.getGroupById(id),
  });
}

export function useJoinedGroups() {
  return useQuery({
    queryKey: ["groups", "joined"],
    queryFn: community.getJoinedGroups,
  });
}

export function useJoinGroup() {
  return useMutation({ mutationFn: community.joinGroup });
}

export function useEvents() {
  return useQuery({ queryKey: ["events"], queryFn: community.getEvents });
}

export function useEvent(id: string) {
  return useQuery({
    queryKey: ["events", id],
    queryFn: () => community.getEventById(id),
  });
}

export function useNews() {
  return useQuery({ queryKey: ["news"], queryFn: community.getNews });
}

export function useCurrentCircle() {
  return useQuery({
    queryKey: ["circle"],
    queryFn: community.getCurrentCircle,
  });
}

export function useRequestGroup() {
  return useMutation({ mutationFn: community.requestGroup });
}
