import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as onboarding from "@/services/onboarding";

/** React Query mutation for saving the onboarding profile. */
export function useSaveOnboarding() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: onboarding.saveOnboarding,
    onSuccess: () => {
      // Re-read the profile (persona/stage/location/goals/interests) and let
      // the checklist re-filter by the new persona + stage.
      queryClient.invalidateQueries({ queryKey: ["current-user"] });
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
      queryClient.invalidateQueries({ queryKey: ["current-user"] }),
  });
}

/** Toggle the learning-reminders opt-in; refreshes the current user. */
export function useUpdateLearningReminders() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: onboarding.updateLearningReminders,
    onSuccess: () =>
      queryClient.invalidateQueries({ queryKey: ["current-user"] }),
  });
}
