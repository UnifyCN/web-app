import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import * as adminEvents from "@/services/adminEvents";
import type {
  CrawlerEventUpdatePayload,
  TeamEventUpdatePayload,
} from "@/lib/admin/eventForm";

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

/** One event for /admin/events/[id]. Inside the `["events"]` family, like the list. */
export const adminEventKey = (id: number) => ["events", "admin", "detail", id] as const;

/** Loads one event; `id` null (a malformed URL) or `enabled: false` never fetches. */
export function useAdminEvent(id: number | null, { enabled = true } = {}) {
  return useQuery({
    queryKey: adminEventKey(id ?? -1),
    queryFn: () => adminEvents.getAdminEvent(id as number),
    enabled: enabled && id !== null,
  });
}

export type AdminEventUpdate =
  | { kind: "team"; id: number; payload: TeamEventUpdatePayload }
  | { kind: "crawler"; id: number; payload: CrawlerEventUpdatePayload };

/** Saves an edit (team row: full update; crawler row: feature + partner only). */
export function useUpdateAdminEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (update: AdminEventUpdate) =>
      update.kind === "team"
        ? adminEvents.updateTeamEvent(update.id, update.payload)
        : adminEvents.updateCrawlerEvent(update.id, update.payload),
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: EVENTS_FAMILY_KEY }),
  });
}

/**
 * Deletes a team event. Every other `["events"]` query refetches; the deleted
 * event's own query is dropped instead (a refetch would only find nothing).
 */
export function useDeleteAdminEvent() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: adminEvents.deleteTeamEvent,
    onSuccess: async (_data, id) => {
      const deletedKey = adminEventKey(id);
      await queryClient.invalidateQueries({
        queryKey: EVENTS_FAMILY_KEY,
        predicate: (query) =>
          JSON.stringify(query.queryKey) !== JSON.stringify(deletedKey),
      });
      queryClient.removeQueries({ queryKey: deletedKey, exact: true });
    },
  });
}
