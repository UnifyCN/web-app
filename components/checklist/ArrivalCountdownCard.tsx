"use client";

import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, PlaneLanding } from "lucide-react";
import { useCurrentUser } from "@/hooks/useProfile";
import { useLocalToday } from "@/hooks/useLocalToday";
import { ArrivalDateDialog } from "@/components/checklist/ArrivalDateDialog";
import {
  claimCountdownShown,
  formatLocalDate,
  getArrivalCountdown,
} from "@/lib/onboarding/arrivalCountdown";
import { trackArrivalCountdownShown } from "@/lib/analytics";
import { cn, RTL_FLIP } from "@/lib/utils";

/**
 * Card at the top of the Checklist, as on mobile: days until the user lands
 * before the arrival day, "Your first 30 days" from that day through day 29,
 * hidden otherwise (and for users with no arrival date). Opens a dialog to
 * change the date. Reads the cached profile, so a new date from this dialog,
 * the arrival prompt or Edit profile shows at once.
 */
export function ArrivalCountdownCard() {
  const { t } = useTranslation();
  const { data: user } = useCurrentUser();
  const today = useLocalToday();
  const [editing, setEditing] = useState(false);
  // Bumped per opening; remounts the dialog so it starts fresh each time.
  const [opening, setOpening] = useState(0);

  const userId = user?.id ?? null;
  const arrivalDate = user?.onboarding?.arrivalDate ?? null;
  const countdown = useMemo(
    () => getArrivalCountdown(arrivalDate, today),
    [arrivalDate, today],
  );
  const day = formatLocalDate(today);

  useEffect(() => {
    if (!userId || countdown.state === "hidden") return;
    if (claimCountdownShown(userId, day)) trackArrivalCountdownShown(countdown);
  }, [userId, day, countdown]);

  if (!userId || !arrivalDate || countdown.state === "hidden") return null;

  const title =
    countdown.state === "pre_arrival"
      ? t("checklist.arrivalCountdown.preArrival", { count: countdown.days })
      : t("checklist.arrivalCountdown.first30Days");
  const Icon = countdown.state === "pre_arrival" ? PlaneLanding : CalendarDays;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setOpening((n) => n + 1);
          setEditing(true);
        }}
        aria-label={`${title}. ${t("checklist.arrivalCountdown.changeHint")}`}
        className="press flex w-full cursor-pointer items-center gap-3 rounded-card border border-border-card bg-surface p-3 text-start transition-colors hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary-bg text-primary">
          <Icon className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-secondary">
            {title}
          </span>
          <span className="block text-xs text-ink-muted">
            {t("checklist.arrivalCountdown.changeHint")}
          </span>
        </span>
        <ChevronRight
          className={cn("h-5 w-5 shrink-0 text-ink-inactive", RTL_FLIP)}
          aria-hidden
        />
      </button>
      <ArrivalDateDialog
        key={opening}
        open={editing}
        userId={userId}
        arrivalDate={arrivalDate}
        onClose={() => setEditing(false)}
      />
    </>
  );
}
