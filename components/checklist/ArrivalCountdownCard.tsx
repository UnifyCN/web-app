"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CalendarDays, ChevronRight, PlaneLanding } from "lucide-react";
import { CURRENT_USER_KEY, useCurrentUser } from "@/hooks/useProfile";
import { TASKS_KEY } from "@/hooks/useChecklist";
import { useLocalToday } from "@/hooks/useLocalToday";
import { ArrivalDateDialog } from "@/components/checklist/ArrivalDateDialog";
import {
  claimCountdownShownAcrossTabs,
  formatLocalDate,
  getArrivalCountdown,
  isDialogOpenFor,
  stageChangedOvernight,
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
  const queryClient = useQueryClient();
  // The account the dialog was opened for. The dialog is open only while that
  // is still the signed-in account: if another account signs in meanwhile, it
  // closes instead of saving to (or showing the date of) the wrong account.
  const [editingFor, setEditingFor] = useState<string | null>(null);
  // Bumped per opening; remounts the dialog so it starts fresh each time.
  const [opening, setOpening] = useState(0);

  const userId = user?.id ?? null;
  const dialogOpen = isDialogOpenFor(editingFor, userId);
  const arrivalDate = user?.onboarding?.arrivalDate ?? null;
  const countdown = useMemo(
    () => getArrivalCountdown(arrivalDate, today),
    [arrivalDate, today],
  );
  const day = formatLocalDate(today);

  useEffect(() => {
    if (!userId || countdown.state === "hidden") return;
    let current = true;
    void claimCountdownShownAcrossTabs(userId, day).then((claimed) => {
      if (claimed && current) trackArrivalCountdownShown(countdown);
    });
    return () => {
      current = false;
    };
  }, [userId, day, countdown]);

  // When the local day rolls over into a new stage (e.g. arrival day), the
  // checklist and profile switch to it at once instead of on the next refetch.
  const previousDay = useRef<{ day: string; userId: string | null } | null>(null);
  useEffect(() => {
    const prev = previousDay.current;
    previousDay.current = { day, userId };
    if (!prev || prev.userId !== userId || prev.day === day) return;
    if (stageChangedOvernight(arrivalDate, prev.day, day)) {
      queryClient.invalidateQueries({ queryKey: TASKS_KEY });
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
    }
  }, [day, userId, arrivalDate, queryClient]);

  const dialog =
    userId && arrivalDate ? (
      <ArrivalDateDialog
        key={opening}
        open={dialogOpen}
        userId={userId}
        arrivalDate={arrivalDate}
        onClose={() => setEditingFor(null)}
      />
    ) : null;

  // The card hides when the countdown does, but the dialog stays mounted in
  // the same place (e.g. midnight passes day 30 while the user is picking a
  // date), so an open dialog keeps its picks.
  // Same children in the same slots either way, so React never remounts it.
  if (!userId || !arrivalDate || countdown.state === "hidden") {
    return (
      <>
        {null}
        {dialog}
      </>
    );
  }

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
          setEditingFor(userId);
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
      {dialog}
    </>
  );
}
