import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import * as community from "@/services/community";

/** React Query hooks for Community data (groups, events, news, circles). */

const GROUPS_KEY = ["groups"] as const;

export function useGroups() {
  return useQuery({ queryKey: GROUPS_KEY, queryFn: community.getGroups });
}

export function useGroup(id: number) {
  return useQuery({
    queryKey: [...GROUPS_KEY, id],
    queryFn: () => community.getGroupById(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useJoinedGroups() {
  return useQuery({
    queryKey: [...GROUPS_KEY, "joined"],
    queryFn: community.getJoinedGroups,
  });
}

export function useJoinGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: community.joinGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useLeaveGroup() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: community.leaveGroup,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: GROUPS_KEY }),
  });
}

export function useEvents() {
  return useQuery({ queryKey: ["events"], queryFn: community.getEvents });
}

export function useEvent(id: number) {
  return useQuery({
    queryKey: ["events", id],
    queryFn: () => community.getEventById(id),
    enabled: Number.isFinite(id) && id > 0,
  });
}

export function useNews() {
  return useQuery({ queryKey: ["news"], queryFn: community.getNews });
}

const CIRCLE_KEY = ["circle"] as const;

export function useCurrentCircle() {
  return useQuery({
    queryKey: CIRCLE_KEY,
    queryFn: community.getCurrentCircle,
  });
}

export function useStartCircleMatching() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: community.startCircleMatching,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CIRCLE_KEY }),
  });
}

export function useCancelCircleMatching() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: community.cancelCircleMatching,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: CIRCLE_KEY }),
  });
}

export function useRequestGroup() {
  return useMutation({ mutationFn: community.requestGroup });
}

/** Warms the news list, shown on both Social (the widget) and Community. */
export function prefetchNews(queryClient: QueryClient) {
  return queryClient.prefetchQuery({
    queryKey: ["news"],
    queryFn: community.getNews,
  });
}

/** Warms the Community tab's lists (same keys and fetchers as the hooks above). */
export function prefetchCommunity(queryClient: QueryClient) {
  return Promise.all([
    queryClient.prefetchQuery({
      queryKey: GROUPS_KEY,
      queryFn: community.getGroups,
    }),
    queryClient.prefetchQuery({
      queryKey: [...GROUPS_KEY, "joined"],
      queryFn: community.getJoinedGroups,
    }),
    queryClient.prefetchQuery({
      queryKey: ["events"],
      queryFn: community.getEvents,
    }),
    prefetchNews(queryClient),
  ]);
}
