import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as onboarding from "@/services/onboarding";
import {
  arrivalDateMutationOptions,
  type ArrivalDateVars,
} from "@/lib/onboarding/arrivalDateMutation";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";
import { TASKS_KEY } from "@/hooks/useChecklist";
import { LEARNING_PROGRESS_KEY, MODULES_KEY } from "@/hooks/useLearn";

/** React Query mutation for saving the onboarding profile. */
export function useSaveOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: onboarding.saveOnboarding,
    onSuccess: () => {
      // Re-read the profile (persona/stage/location/goals/interests) and let
      // the checklist and Learn re-filter by the new persona, stage and
      // province.
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      queryClient.invalidateQueries({ queryKey: MODULES_KEY });
      queryClient.invalidateQueries({ queryKey: LEARNING_PROGRESS_KEY });
    },
  });
}

/** Edit the onboarding first name (display name); refreshes the current user. */
export function useUpdateDisplayName() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: onboarding.updateDisplayName,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
  });
}

/** Toggle the learning-reminders opt-in; refreshes the current user. */
export function useUpdateLearningReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: onboarding.updateLearningReminders,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY }),
  });
}

/**
 * Save the arrival date (one-time prompt, countdown dialog). Shows the new
 * date and stage at once for the account it was saved for, then refreshes
 * everything the stage feeds (profile, checklist, Learn). `onSaved` runs even
 * if the caller has unmounted by then (see arrivalDateMutationOptions).
 */
export function useUpdateArrivalDate(
  { onSaved }: { onSaved?: (vars: ArrivalDateVars) => void } = {},
) {
  const queryClient = useQueryClient();
  return useMutation(
    arrivalDateMutationOptions({
      queryClient,
      mutationFn: onboarding.updateArrivalDate,
      currentUserKey: CURRENT_USER_KEY,
      invalidateKeys: [TASKS_KEY, MODULES_KEY, LEARNING_PROGRESS_KEY],
      onSaved,
    }),
  );
}
