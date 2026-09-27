import { useMutation, useQueryClient, type Query } from "@tanstack/react-query";
import * as adminEvents from "@/services/adminEvents";
import { ADMIN_EVENTS_KEY, EVENTS_FAMILY_KEY } from "@/hooks/useAdminEvents";
import type { AdminEvent } from "@/lib/admin/eventList";
import {
  rollbackEventVisibility,
  withEventVisibility,
  type VisibilityEdit,
} from "@/lib/admin/eventVisibility";

/**
 * The inline "Feature" switch and partner dropdown on /admin/events (#146).
 *
 * Optimistic: the cached list shows the new value at once and goes back to the old
 * one if the save fails. Each row calls this hook for itself, so `isPending` and
 * `error` belong to that row only.
 */

export const EVENT_VISIBILITY_MUTATION_KEY = ["events", "admin", "visibility"] as const;

export type EventVisibilitySave = Extract<VisibilityEdit, { kind: "save" }>;

const isAdminList = (query: Query) =>
  JSON.stringify(query.queryKey) === JSON.stringify(ADMIN_EVENTS_KEY);

export function useUpdateEventVisibility() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationKey: EVENT_VISIBILITY_MUTATION_KEY,
    // Same service for team and crawler rows: the payload is the 3-key one, and the
    // write chains .select("id") and throws on 0 rows (an RLS block surfaces).
    mutationFn: ({ id, payload }: EventVisibilitySave) =>
      adminEvents.updateCrawlerEvent(id, payload),
    onMutate: async ({ id, next }) => {
      // A list refetch that is already running must not land on top of the new value.
      await queryClient.cancelQueries({ queryKey: ADMIN_EVENTS_KEY, exact: true });
      queryClient.setQueryData<AdminEvent[]>(ADMIN_EVENTS_KEY, (events) =>
        withEventVisibility(events, id, next),
      );
    },
    onError: (_error, { id, previous, next }) => {
      queryClient.setQueryData<AdminEvent[]>(ADMIN_EVENTS_KEY, (events) =>
        rollbackEventVisibility(events, id, previous, next),
      );
    },
    onSettled: () => {
      // Every change invalidates the ["events"] family (/community, event details).
      // The admin list itself refetches only after the last pending inline save, so
      // a refetch cannot briefly undo another row's optimistic value. This mutation
      // still counts as pending while onSettled runs, hence "> 1".
      const othersPending =
        queryClient.isMutating({ mutationKey: EVENT_VISIBILITY_MUTATION_KEY }) > 1;
      return queryClient.invalidateQueries({
        queryKey: EVENTS_FAMILY_KEY,
        predicate: othersPending ? (query) => !isAdminList(query) : undefined,
      });
    },
  });
}
