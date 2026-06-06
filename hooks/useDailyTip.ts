import { useQuery } from "@tanstack/react-query";
import * as dailyTip from "@/services/dailyTip";

const DAILY_TIP_KEY = ["daily-tip"] as const;

/** The user's personalized tip for today (per-user, per-day, server-cached). */
export function useDailyTip() {
  return useQuery({
    queryKey: DAILY_TIP_KEY,
    queryFn: dailyTip.getDailyTip,
    // The tip only changes once per day; avoid refetching on every focus.
    staleTime: 1000 * 60 * 60,
  });
}
