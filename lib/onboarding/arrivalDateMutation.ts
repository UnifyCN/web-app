import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { UserProfile } from "@/types";
import { calculateUserStage } from "@/lib/onboarding/calculateUserStage";

export type ArrivalDateVars = { arrivalDate: string; expectedUserId: string };

/**
 * Mutation options for saving the arrival date (the one-time prompt and the
 * countdown card's dialog). Built here, not inline in the hook, so the
 * success path can be tested without React.
 *
 * - `onSaved` runs inside the mutation's own success handler, so it still runs
 *   when the component that started the save has unmounted (for example the
 *   countdown card hiding itself because the new date is 30+ days past).
 * - The cached profile is patched only when it is still the account the save
 *   was for, so another account never shows this account's date or stage.
 */
export function arrivalDateMutationOptions({
  queryClient,
  mutationFn,
  currentUserKey,
  invalidateKeys,
  onSaved,
}: {
  queryClient: QueryClient;
  mutationFn: (vars: ArrivalDateVars) => Promise<void>;
  currentUserKey: QueryKey;
  invalidateKeys: QueryKey[];
  onSaved?: (vars: ArrivalDateVars) => void;
}) {
  return {
    mutationFn,
    onSuccess: (_data: void, vars: ArrivalDateVars) => {
      try {
        onSaved?.(vars);
      } catch (err) {
        // Tracking must never break the save.
        console.warn("[arrivalDate] onSaved failed", err);
      }
      queryClient.setQueryData<UserProfile | null>(currentUserKey, (old) =>
        old?.onboarding && old.id === vars.expectedUserId
          ? {
              ...old,
              onboarding: {
                ...old.onboarding,
                arrivalDate: vars.arrivalDate,
                stage: calculateUserStage(vars.arrivalDate),
              },
            }
          : old,
      );
      queryClient.invalidateQueries({ queryKey: currentUserKey });
      for (const key of invalidateKeys) {
        queryClient.invalidateQueries({ queryKey: key });
      }
    },
  };
}
