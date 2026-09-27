import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as adminEvents from "@/services/adminEvents";

/**
 * React Query hooks for the admin events pages.
 *
 * The key sits inside the `["events"]` family on purpose: admin mutations
 * invalidate `["events"]`, which refreshes this list and the /community Events tab
 * together.
 */
export const ADMIN_EVENTS_KEY = ["events", "admin"] as const;

export function useAdminEvents() {
  return useQuery({
    queryKey: ADMIN_EVENTS_KEY,
    queryFn: adminEvents.getAdminEvents,
  });
}

/** The `["events"]` family: the admin list, /community's Events tab, and event details. */
const EVENTS_FAMILY_KEY = ["events"] as const;

/** Adds a team event. On success every `["events"]` query refetches. */
export function useCreateAdminEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminEvents.createAdminEvent,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: EVENTS_FAMILY_KEY }),
  });
}
