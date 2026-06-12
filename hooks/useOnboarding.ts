import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as onboarding from "@/services/onboarding";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";

/** React Query mutation for saving the onboarding profile. */
export function useSaveOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: onboarding.saveOnboarding,
    onSuccess: () => {
      // Re-read the profile (persona/stage/location/goals/interests) and let
      // the checklist re-filter by the new persona + stage.
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
      queryClient.invalidateQueries({ queryKey: ["tasks"] });
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
