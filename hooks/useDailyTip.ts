import { useQuery } from "@tanstack/react-query";
import * as dailyTip from "@/services/dailyTip";
import { useCurrentUser } from "@/hooks/useProfile";

/** The user's personalized tip for today (per-user, per-day, server-cached). */
export function useDailyTip() {
  // Key on the user id so a different signed-in user can't read the previous
  // user's cached tip (cross-user cache leakage). `null` is the mock /
  // not-signed-in bucket — the service falls back to a mock tip there.
  const { data: user } = useCurrentUser();
  return useQuery({
    queryKey: ["daily-tip", user?.id ?? null],
    queryFn: dailyTip.getDailyTip,
    // The tip only changes once per day; avoid refetching on every focus.
    staleTime: 1000 * 60 * 60,
  });
}
