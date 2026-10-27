"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";
import { PhaseMessage } from "./TaskStatePanel";
import { progressFor } from "./TaskStatePanel";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { stillOwned, type AccountOwner } from "@/lib/accountSession";
import {
  isStepProposal,
  type StepProposal,
} from "@/lib/companionActions/contract";
import type { StepProposalResult } from "@/lib/companionActions/client";
import { stepProposalKey } from "@/lib/companionActions/queryKeys";
import {
  isUnresolved,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import {
  useStepProposal,
  useTaskActionClient,
  useTaskActionPhase,
  type TaskProgressView,
} from "@/hooks/useTaskActions";

/**
 * Review of suggested steps for one task (mobile-app#366), in the direction B drawer.
 * Nothing is saved until approval. Choosing which steps to add saves a new revision
 * of the server draft first, so the approval always names exactly the steps shown as
 * selected. Not now closes the draft and writes nothing.
 */
export function StepProposalPanel({
  proposalId,
  view,
  store,
  taskTitle,
}: {
  proposalId: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** The current title of the task the steps are for, or null. */
  taskTitle: string | null;
}) {
  const { t } = useTranslation();
  const key = `proposal:${proposalId}`;
  const queryClient = useQueryClient();
  const bound = useTaskActionClient();
  const query = useStepProposal(proposalId);
  const phase = useTaskActionPhase(store, key);
  // The steps first suggested, so an excluded one can be selected again.
  const [suggested, setSuggested] = useState<string[] | null>(null);
  const [request, setRequest] = useState<{
    owner: AccountOwner;
    state: "busy" | "failed";
  } | null>(null);
  const ownRequest =
    request &&
    bound &&
    request.owner.accountId === bound.owner.accountId &&
    request.owner.epoch === bound.owner.epoch
      ? request.state
      : null;

  const proposal: StepProposal | undefined =
    phase.phase === "needs_review" &&
    isStepProposal(phase.proposal) &&
    phase.proposal.proposalRevision >= (query.data?.proposalRevision ?? 0)
      ? phase.proposal
      : query.data;
  if (proposal && suggested === null) setSuggested(proposal.operation.titles);

  if (!proposal) {
    return (
      <p
        role="status"
        className={cn(
          "text-sm text-ink-muted",
          !query.isError && "loading-delayed",
        )}
      >
        {query.isError
          ? t("taskCreate.draftUnavailable")
          : t("taskCreate.loadingDraft")}
      </p>
    );
  }

  const selected = proposal.operation.titles;
  const all = [...(suggested ?? selected)];
  for (const title of selected) if (!all.includes(title)) all.push(title);
  const parent = progressFor(proposal.operation.task_ref, view);
  const requestBusy = ownRequest === "busy";
  const writable =
    Boolean(store && bound) &&
    view.canWrite &&
    proposal.status === "draft" &&
    !parent.removed &&
    parent.state !== "completed";
  const canWrite = writable && !isUnresolved(phase) && !requestBusy;
  const receipt = phase.phase === "saved" ? phase.receipt : proposal.receipt;
  const task = taskTitle ?? t("taskSteps.cardTitleUnknownTask");

  /** A Not now or selection change, made and shown only as the session that opened it. */
  async function draftRequest(run: () => Promise<StepProposalResult>) {
    if (!bound || !stillOwned(bound.owner)) return;
    const { owner } = bound;
    setRequest({ owner, state: "busy" });
    const result = await run();
    if (!stillOwned(owner)) return;
    if (result.kind === "ok" || result.kind === "changed") {
      setRequest(null);
      queryClient.setQueryData(
        stepProposalKey(owner.accountId as string, proposalId),
        result.proposal,
      );
      return;
    }
    setRequest({ owner, state: "failed" });
  }

  function toggle(title: string) {
    if (!canWrite || !bound || !proposal) return;
    const next = all.filter((x) =>
      x === title ? !selected.includes(title) : selected.includes(x),
    );
    if (next.length === 0) return;
    // The selection is a new revision of the draft; approval then names exactly it.
    store?.supersedeNotApplied(key);
    void draftRequest(() =>
      bound.client.reviseSteps(proposal.proposalId, proposal.proposalRevision, {
        type: "step.create",
        task_ref: proposal.operation.task_ref,
        titles: next,
      }),
    );
  }

  function approve() {
    if (!canWrite || !store || !proposal) return;
    store.dismiss(key);
    void store.applyOperation(key, proposal.operation, {
      kind: "approved_proposal",
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
    });
  }

  function notNow() {
    if (!canWrite || !bound || !proposal) return;
    void draftRequest(() =>
      bound.client.cancelSteps(proposal.proposalId, proposal.proposalRevision),
    );
  }

  const reviewNote =
    proposal.status === "draft" && proposal.reviewReason === "context_changed"
      ? t("taskSteps.needsReview")
      : proposal.status === "draft" && proposal.reviewReason === "restored"
        ? t("taskSteps.restored")
        : null;

  return (
    <section className="space-y-4">
      <header>
        <p className="text-xs font-medium text-ink-muted">
          {proposal.status === "draft"
            ? t("taskSteps.draftBadge")
            : t("taskSteps.cardEyebrow")}
        </p>
        <h3
          tabIndex={-1}
          data-drawer-focus=""
          className="mt-0.5 break-words text-lg font-semibold text-ink-secondary focus-visible:outline-none"
        >
          {t("taskSteps.forTask", { task })}
        </h3>
      </header>
      {view.stale && (
        <p className="flex items-start gap-2 rounded-lg bg-surface-card px-3 py-2 text-sm text-ink-tertiary">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("taskActions.offline")}
        </p>
      )}
      {proposal.status === "draft" && parent.state === "completed" && (
        <p className="text-sm text-destructive-label">
          {t("taskSteps.taskCompleted")}
        </p>
      )}
      {proposal.status === "draft" && parent.removed && (
        <p className="text-sm text-destructive-label">
          {t("taskSteps.removedTask")}
        </p>
      )}
      {reviewNote && (
        <p className="rounded-lg bg-primary-bg px-3 py-2 text-sm text-ink-secondary">
          {reviewNote}
        </p>
      )}
      {proposal.status === "draft" && (
        <p className="text-xs text-ink-muted">{t("taskSteps.reviewHint")}</p>
      )}

      <ul className="divide-y divide-border-card">
        {(proposal.status === "draft" ? all : selected).map((title) => (
          <li key={title}>
            <label
              className={cn(
                "flex min-h-11 items-center gap-3 py-1",
                canWrite ? "press-dim cursor-pointer" : "cursor-not-allowed",
              )}
            >
              <input
                type="checkbox"
                checked={selected.includes(title)}
                aria-disabled={!canWrite}
                onChange={() => toggle(title)}
                className="h-5 w-5 shrink-0 accent-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
              />
              <span className="min-w-0 break-words text-base text-ink-secondary">
                {title}
              </span>
            </label>
          </li>
        ))}
      </ul>
      {proposal.existingSteps.map((s) => (
        <p key={s.stepId} className="text-xs text-ink-muted">
          {t("taskSteps.sameTitle", { title: s.title })}
        </p>
      ))}

      <div aria-live="polite" role="status" className="space-y-2">
        {requestBusy && (
          <p className="loading-delayed text-sm text-ink-tertiary">
            {t("taskSteps.updating")}
          </p>
        )}
        {ownRequest === "failed" && (
          <p className="text-sm text-destructive-label">
            {t("taskActions.refused")}
          </p>
        )}
        {proposal.status === "cancelled" && (
          <p className="text-sm text-ink-tertiary">{t("taskSteps.closed")}</p>
        )}
        {receipt && (
          <p className="text-sm font-semibold text-ink-secondary">
            {t("taskSteps.added", { count: receipt.steps?.length ?? 0 })}
          </p>
        )}
        {phase.phase === "refused" && phase.reason === "task_completed" ? (
          <p className="text-sm text-destructive-label">
            {t("taskSteps.taskCompleted")}
          </p>
        ) : (
          phase.phase !== "saved" &&
          phase.phase !== "needs_review" && (
            <PhaseMessage
              writable={writable}
              phase={phase.phase}
              phaseValue={phase}
              stateLabel={(s) => t(`taskActions.state.${s}`)}
              store={store}
              taskRef={key}
            />
          )
        )}
      </div>

      {proposal.status === "draft" && !receipt && (
        <div className="flex flex-wrap gap-2">
          {/* Dark fill as in the reviewed prototype: white on the brand orange is below 4.5:1. */}
          <Button
            type="button"
            aria-disabled={!canWrite}
            onClick={approve}
            className={cn(
              "bg-ink-secondary hover:bg-ink",
              !canWrite && "cursor-not-allowed opacity-60",
            )}
          >
            {t("taskSteps.approve", { count: selected.length })}
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-disabled={!canWrite}
            onClick={notNow}
            className={cn(!canWrite && "cursor-not-allowed opacity-60")}
          >
            {t("taskSteps.notNow")}
          </Button>
        </div>
      )}
    </section>
  );
}
