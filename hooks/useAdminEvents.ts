import { useQuery } from "@tanstack/react-query";
import * as adminEvents from "@/services/adminEvents";

/**
 * React Query hooks for the admin events pages.
 *
 * The key sits inside the `["events"]` family on purpose: admin mutations (later
 * slices) invalidate `["events"]`, which refreshes this list and the /community
 * Events tab together.
 */
export const ADMIN_EVENTS_KEY = ["events", "admin"] as const;

export function useAdminEvents() {
  return useQuery({
    queryKey: ADMIN_EVENTS_KEY,
    queryFn: adminEvents.getAdminEvents,
  });
}
