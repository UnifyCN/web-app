"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/ui/ModalShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { FormError } from "@/components/auth/FormError";
import { ArrivalMonthFields } from "@/components/onboarding/ArrivalMonthFields";
import { useUpdateArrivalDate } from "@/hooks/useOnboarding";
import { getDaysUntilArrival } from "@/lib/onboarding/arrivalStage";
import {
  ARRIVAL_DATE_YEARS_AHEAD,
  ARRIVAL_DATE_YEARS_BACK,
  isArrivalDateInRange,
} from "@/lib/onboarding/arrivalCountdown";
import { trackArrivalDateChanged } from "@/lib/analytics";

type Parts = { year: number | null; month: number | null; day: number | null };

function toParts(date: string): Parts {
  const [y, m, d] = date.split("-").map(Number);
  return { year: y || null, month: m || null, day: d || null };
}

function toDate({ year, month, day }: Parts): string | null {
  if (year === null || month === null || day === null) return null;
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/**
 * Change the arrival date from the countdown card (mobile's arrival-date
 * sheet): an exact day, 5 years back to 3 ahead. Saves only the date and the
 * stage, for the account the dialog opened for.
 */
export function ArrivalDateDialog({
  open,
  userId,
  arrivalDate,
  onClose,
}: {
  open: boolean;
  userId: string;
  arrivalDate: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const mutation = useUpdateArrivalDate();
  // The parent remounts this dialog for every opening (`key`), so each one
  // starts from the saved date and belongs to the account it opened for.
  const [parts, setParts] = useState<Parts>(() => toParts(arrivalDate));
  const [ownerId] = useState(userId);

  const picked = toDate(parts);
  const canSave =
    picked !== null &&
    picked !== arrivalDate &&
    isArrivalDateInRange(picked) &&
    !mutation.isPending;

  const close = () => {
    if (!mutation.isPending) onClose();
  };

  const save = (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSave || picked === null) return;
    mutation.mutate(
      { arrivalDate: picked, expectedUserId: ownerId },
      {
        onSuccess: () => {
          const days = getDaysUntilArrival(picked);
          if (days !== null) trackArrivalDateChanged(days);
          onClose();
        },
      },
    );
  };

  const thisYear = new Date().getFullYear();

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={mutation.isPending}
      title={t("checklist.arrivalDate.sheetTitle")}
    >
      <form onSubmit={save} className="space-y-3" noValidate>
        <ArrivalMonthFields
          day={parts.day}
          month={parts.month}
          year={parts.year}
          years={{
            from: thisYear - ARRIVAL_DATE_YEARS_BACK,
            to: thisYear + ARRIVAL_DATE_YEARS_AHEAD,
          }}
          disabled={mutation.isPending}
          onChange={(next) =>
            setParts({ year: next.year, month: next.month, day: next.day ?? null })
          }
        />
        <FormError className="text-xs">
          {mutation.isError ? t("checklist.arrivalDate.saveError") : null}
        </FormError>
        <div className="pt-2">
          <AuthButton type="submit" loading={mutation.isPending} disabled={!canSave}>
            {t("checklist.arrivalDate.save")}
          </AuthButton>
        </div>
      </form>
    </ModalShell>
  );
}
