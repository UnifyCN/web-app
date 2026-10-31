"use client";

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/ui/ModalShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { FormError } from "@/components/auth/FormError";
import { useCurrentUser } from "@/hooks/useProfile";
import { useUpdateArrivalDate } from "@/hooks/useOnboarding";
import { ArrivalMonthFields } from "@/components/onboarding/ArrivalMonthFields";
import {
  arrivalMonthToDate,
  hasSeenArrivalPrompt,
  markArrivalPromptSeen,
  needsArrivalPrompt,
} from "@/lib/onboarding/arrivalPrompt";

function otherDialogOpen(): boolean {
  return document.querySelector('[role="dialog"][aria-modal="true"]') !== null;
}

/**
 * Asks once for the arrival month of users who picked web's old "I haven't
 * arrived in Canada yet" option, which saved no date. Mounted once in the
 * (main) layout. Waits for any other dialog (e.g. the What's new tour) to
 * close. "Not now" keeps them on the pre-arrival track (stage 0).
 */
export function ArrivalDatePrompt() {
  const { t } = useTranslation();
  const { data: user } = useCurrentUser();
  const mutation = useUpdateArrivalDate();
  const [open, setOpen] = useState(false);
  // The account the prompt opened for; the save is refused for any other.
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [month, setMonth] = useState<number | null>(null);
  const [year, setYear] = useState<number | null>(null);

  const userId = user?.id;
  const needed = needsArrivalPrompt(user?.onboarding);

  useEffect(() => {
    if (!userId || !needed || hasSeenArrivalPrompt(userId)) return;
    const show = () => {
      if (hasSeenArrivalPrompt(userId)) return true;
      if (otherDialogOpen()) return false;
      markArrivalPromptSeen(userId);
      setOwnerId(userId);
      setOpen(true);
      return true;
    };
    if (show()) return;
    const observer = new MutationObserver(() => {
      if (show()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, [userId, needed]);

  const close = () => {
    mutation.reset();
    setOpen(false);
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (month === null || year === null || ownerId === null) return;
    mutation.mutate(
      { arrivalDate: arrivalMonthToDate(year, month), expectedUserId: ownerId },
      { onSuccess: close },
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={mutation.isPending}
      title={t("quiz.q.arrivalDate")}
      description={t("onboardingWeb.arrival.promptDescription")}
    >
      <form onSubmit={save} className="space-y-3" noValidate>
        <ArrivalMonthFields
          month={month}
          year={year}
          disabled={mutation.isPending}
          onChange={(next) => {
            setMonth(next.month);
            setYear(next.year);
          }}
        />
        <FormError className="text-xs">
          {mutation.isError ? t("common.errorGeneric") : null}
        </FormError>
        <div className="space-y-2 pt-2">
          <AuthButton
            type="submit"
            loading={mutation.isPending}
            disabled={month === null || year === null}
          >
            {t("common.save")}
          </AuthButton>
          <button
            type="button"
            onClick={close}
            disabled={mutation.isPending}
            className="w-full cursor-pointer rounded-full py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("onboardingWeb.arrival.promptLater")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
