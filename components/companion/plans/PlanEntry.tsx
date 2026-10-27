"use client";

import { useTranslation } from "react-i18next";
import { CalendarCheck, ChevronRight } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { usePlans } from "@/hooks/usePlans";

export type PlanTarget = { proposalId: string } | { planId: string };

/**
 * Persistent entry to the account's settlement plan (direction B, mobile-app#364). It
 * sits above the conversation, outside any message, so it is the same in every
 * conversation and after a reload. While the read is pending it says so: loading and
 * a failed read never look like "no plan". An open draft comes first, because it still
 * needs review; otherwise the most recently saved plan, with progress read from the
 * shared tasks.
 */
export function PlanEntry({ onOpen }: { onOpen: (target: PlanTarget) => void }) {
  const { t } = useTranslation();
  const { status, plans, drafts } = usePlans();
  if (status === "unavailable" || status === "signed_out") return null;

  if (status === "loading" || status === "failed") {
    return (
      <div className="border-b border-border-card px-4 py-2 md:px-6">
        <div className="mx-auto flex w-full max-w-3xl items-center gap-3">
          <PlanIcon />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-ink-secondary">{t("plans.entryTitle")}</p>
            <p
              role="status"
              className={cn("text-xs text-ink-muted", status === "loading" && "loading-delayed")}
            >
              {status === "loading" ? t("plans.entryLoading") : t("plans.entryFailed")}
            </p>
          </div>
        </div>
      </div>
    );
  }

  const draft = drafts[0];
  const plan = plans[0];
  if (!draft && !plan) return null;
  const live = plan ? plan.items.filter((i) => !i.removed) : [];
  const progress = t("plans.entryProgress", {
    done: live.filter((i) => i.state === "completed").length,
    total: live.length,
  });
  // A Retry found a change: the remaining addition waits for the user's new approval.
  const summary = draft
    ? t("plans.entryReview")
    : plan!.review?.status === "draft"
      ? t("plans.entryNeedsReview", { progress })
      : progress;
  const goal = draft ? draft.goal : plan!.goal;
  const label = draft
    ? t("plans.entryDraftA11y", { goal })
    : t("plans.entryA11y", { goal, summary });
  return (
    <div className="border-b border-border-card px-4 py-2 md:px-6">
      <button
        type="button"
        aria-label={label}
        onClick={() => onOpen(draft ? { proposalId: draft.id } : { planId: plan!.planId })}
        className="press-dim mx-auto flex min-h-11 w-full max-w-3xl cursor-pointer items-center gap-3 rounded-lg text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        <PlanIcon draft={Boolean(draft)} />
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-semibold text-ink-secondary">
            {draft ? t("plans.entryDraftTitle") : t("plans.entryTitle")}
          </span>
          <span className="block break-words text-sm text-ink">{goal}</span>
          <span className="block text-xs text-ink-muted">{summary}</span>
        </span>
        <ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-placeholder", RTL_FLIP)} aria-hidden />
      </button>
    </div>
  );
}

function PlanIcon({ draft = false }: { draft?: boolean }) {
  return (
    <span
      className={cn(
        "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg",
        draft && "border border-dashed border-primary",
      )}
    >
      <CalendarCheck className="h-4 w-4 text-ink-secondary" aria-hidden />
    </span>
  );
}
