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
