"use client";

import { useTranslation } from "react-i18next";
import { CalendarCheck } from "lucide-react";
import { cn } from "@/lib/utils";
import type { PlanProposal } from "@/lib/companionActions/planContract";
import {
  isPlanUnresolved,
  proposalKey,
  type PlanStore,
} from "@/lib/companionActions/planStore";
import { usePlanPhase } from "@/hooks/usePlans";
import type { ChatMessage } from "@/types";
import { planReceiptSummary } from "./planText";

/**
 * Compact cards under a conversation message (direction B, mobile-app#364): the plan
 * the answer suggested. A draft says it is not saved and opens the drawer for review.
 * A saved plan shows its receipt (the recorded result, not assistant text) and opens
 * the plan. The card is a message reference: the plan itself lives outside it.
 */
export function PlanCards({
  message,
  proposals,
  store,
  onOpen,
}: {
  message: ChatMessage;
  proposals: PlanProposal[];
  store: PlanStore | null;
  onOpen: (proposalId: string) => void;
}) {
  const mine = proposals.filter((p) => p.source?.messageId === message.id);
  return (
    <>
      {mine.map((p) => (
        <PlanCard key={p.id} proposal={p} store={store} onOpen={() => onOpen(p.id)} />
      ))}
    </>
  );
}

function PlanCard({
  proposal,
  store,
  onOpen,
}: {
  proposal: PlanProposal;
  store: PlanStore | null;
  onOpen: () => void;
}) {
  const { t } = useTranslation();
  const phase = usePlanPhase(store, proposalKey(proposal.id));
  const receipt = phase.phase === "saved" ? phase.reply.receipt : proposal.receipt;
  const draft = proposal.status === "draft" && !receipt;
  const existing = proposal.items.filter((i) => i.kind === "existing").length;
  const added = proposal.items.filter((i) => i.kind === "new" && i.include).length;
  const transient = phase.phase === "saving" || phase.phase === "checking";
  const status = receipt
    ? receipt.undoneBy
      ? t("plans.cardUndone")
      : planReceiptSummary(t, receipt)
    : proposal.status === "cancelled"
      ? t("plans.cardClosed")
      : isPlanUnresolved(phase)
        ? t("taskActions.checking")
        : t("plans.cardCounts", {
            existing: t("plans.existingCount", { count: existing }),
            added: t("plans.newCount", { count: added }),
          });
  return (
    <article
      data-testid="plan-card"
      aria-label={proposal.goal}
      className={cn(
        "mt-2 flex items-center gap-3 rounded-xl border border-border-card bg-surface px-3 py-2.5",
        draft && "border-dashed",
      )}
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg">
        <CalendarCheck className="h-4 w-4 text-ink-secondary" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-xs text-ink-muted">{draft ? t("plans.cardDraft") : t("plans.cardSaved")}</p>
        <p className="break-words text-sm font-semibold text-ink">{proposal.goal}</p>
        <p role="status" className={cn("text-xs text-ink-secondary", transient && "loading-delayed")}>
          {status}
        </p>
      </div>
      <button
        type="button"
        onClick={onOpen}
        aria-label={
          draft
            ? t("plans.reviewA11y", { goal: proposal.goal })
            : t("plans.continueA11y", { goal: proposal.goal })
        }
        className="press inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border border-border-card px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
      >
        {draft ? t("plans.review") : t("plans.continue")}
      </button>
    </article>
  );
}
