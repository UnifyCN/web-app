"use client";

import { useId, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import type {
  TaskEditProposal,
  TaskProposal,
} from "@/lib/companionActions/contract";
import { taskProposalKey } from "@/lib/companionActions/queryKeys";
import {
  isUnresolved,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import {
  useTaskActionClient,
  useTaskActionPhase,
  type TaskProgressView,
} from "@/hooks/useTaskActions";
import { stillOwned, type AccountOwner } from "@/lib/accountSession";
import { ReceiptBlock } from "./ReceiptBlock";
import { PhaseMessage } from "./TaskStatePanel";
import { changeLines } from "./editText";

interface Props {
  proposal: TaskEditProposal;
  view: TaskProgressView;
  store: TaskActionStore | null;
  /** The task's title from the account's Checklist, when the draft does not carry one. */
  fallbackTitle: string | null;
}

/**
 * Review of one server-owned edit draft (mobile-app#365), direction B drawer. It shows
 * the exact value each field has now and the value approval saves, and one control that
 * names the change. Approval binds to the shown revision: when a field it changes moved
 * on elsewhere, the server returns a revised draft, shown here with the value it was
 * suggested against, and nothing is saved until that revision is approved. Every write
 * needs a connection and a fresh read; offline nothing is sent or queued.
 */
export function TaskEditProposalPanel({
  proposal: read,
  view,
  store,
  fallbackTitle,
}: Props) {
  const { t } = useTranslation();
  const ids = useId();
  const key = `proposal:${read.proposalId}`;
  const queryClient = useQueryClient();
  const bound = useTaskActionClient();
  const phase = useTaskActionPhase(store, key);
  // A Not now request in flight, or its refusal, for the session it was made in.
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

  // A revised draft from a needs-review reply is newer than the last read.
  const proposal =
    phase.phase === "needs_review" &&
    phase.proposal.kind === "task_edit" &&
    phase.proposal.proposalRevision >= read.proposalRevision
      ? phase.proposal
      : read;
  const title =
    proposal.task?.title ?? fallbackTitle ?? t("taskEdit.unknownTask");
  const revised = proposal.reviewReason === "context_changed";
  // Only an open draft shows values to review; a saved one shows its receipt.
  const lines =
    proposal.status === "draft"
      ? changeLines(
          t as never,
          proposal.operation,
          proposal.task,
          revised ? proposal.previousTask : null,
        )
      : [];
  const nothingToSave = lines.length > 0 && lines.every((l) => l.same);
  const busy = isUnresolved(phase) || ownRequest === "busy";
  const writable =
    Boolean(store && bound) && view.canWrite && proposal.status === "draft";
  const canWrite = writable && !busy;
  const canApprove = canWrite && !nothingToSave;
  const receipt = phase.phase === "saved" ? phase.receipt : proposal.receipt;
  const completes =
    proposal.operation.type === "task.set_state" &&
    proposal.operation.state === "completed";

  function approve() {
    if (!canApprove || !store) return;
    store.dismiss(key);
    void store.applyOperation(key, proposal.operation, {
      kind: "approved_proposal",
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
    });
  }

  /** Not now, made as the account and session the panel shows; a late reply is dropped. */
  async function notNow() {
    if (!canWrite || !bound || !stillOwned(bound.owner)) return;
    const { client, owner } = bound;
    setRequest({ owner, state: "busy" });
    const result = await client.cancel(
      proposal.proposalId,
      proposal.proposalRevision,
    );
    if (!stillOwned(owner)) return;
    if (result.kind === "ok" || result.kind === "changed") {
      setRequest(null);
      queryClient.setQueryData<TaskProposal>(
        taskProposalKey(owner.accountId, proposal.proposalId),
        result.proposal,
      );
      return;
    }
    setRequest({ owner, state: "failed" });
  }

  const note =
    proposal.status !== "draft"
      ? null
      : revised
        ? t("taskEdit.reviewContextChanged")
        : proposal.reviewReason === "restored"
          ? t("taskEdit.reviewRestored")
          : null;

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-5">
      <div>
        <p className="text-xs font-medium text-ink-muted">
          {proposal.status === "draft"
            ? t("taskEdit.draftBadge")
            : t("taskEdit.cardEyebrow")}
        </p>
        <h3
          id={`${ids}-title`}
          tabIndex={-1}
          data-drawer-focus=""
          className="mt-0.5 break-words text-lg font-semibold text-ink-secondary focus-visible:outline-none"
        >
          {title}
        </h3>
      </div>

      {view.stale && (
        <p className="flex items-start gap-2 rounded-lg bg-surface-card px-3 py-2 text-sm text-ink-tertiary">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("taskActions.offline")}
        </p>
      )}

      {note && (
        <p className="rounded-lg border border-primary-subtle bg-primary-bg px-3 py-2 text-sm text-ink-secondary">
          {note}
        </p>
      )}

      <dl className="space-y-2.5">
        {lines.map((line) => (
          <div
            key={line.field}
            className="rounded-lg border border-border-card px-3 py-2.5"
          >
            <dt className="text-xs font-semibold text-ink-secondary">
              {line.label}
            </dt>
            {line.from !== null && (
              <dd className="break-words text-sm text-ink-tertiary">
                {t("taskEdit.now", { value: line.from })}
              </dd>
            )}
            <dd className="break-words text-sm font-semibold text-ink-secondary">
              {t("taskEdit.after", { value: line.to })}
            </dd>
            {line.was && (
              <dd className="break-words text-xs text-ink-muted">
                {t("taskEdit.was", { value: line.was })}
              </dd>
            )}
          </div>
        ))}
      </dl>
      {completes && (
        <p className="text-xs text-ink-tertiary">
          {t("taskActions.completedHint")}
        </p>
      )}
      {nothingToSave && proposal.status === "draft" && (
        <p className="text-xs text-ink-tertiary">{t("taskEdit.alreadySet")}</p>
      )}

      <div aria-live="polite" role="status" className="space-y-3">
        {proposal.status === "cancelled" && (
          <p className="text-sm text-ink-tertiary">{t("taskEdit.closed")}</p>
        )}
        {ownRequest === "failed" && (
          <p className="text-sm text-destructive-label">
            {t("taskActions.refused")}
          </p>
        )}
        {phase.phase !== "saved" && phase.phase !== "needs_review" && (
          <PhaseMessage
            writable={writable && ownRequest !== "busy"}
            phase={phase.phase}
            phaseValue={phase}
            stateLabel={(s) => t(`taskActions.state.${s}`)}
            store={store}
            taskRef={key}
          />
        )}
        {receipt && (
          <ReceiptBlock
            receipt={receipt}
            storeKey={key}
            store={store}
            canWrite={Boolean(store) && view.canWrite && !busy}
            taskTitle={title}
          />
        )}
      </div>

      {proposal.status === "draft" && (
        <div className="flex flex-wrap gap-2">
          {/* Dark fill as in the reviewed prototype: white on the brand orange is below 4.5:1. */}
          <Button
            type="button"
            aria-label={t("taskEdit.approveA11y", { title })}
            aria-disabled={!canApprove}
            className={cn(
              "bg-ink-secondary hover:bg-ink",
              !canApprove && "cursor-not-allowed opacity-60",
            )}
            onClick={approve}
          >
            {t("taskEdit.approve")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-disabled={!canWrite}
            className={cn(!canWrite && "cursor-not-allowed opacity-60")}
            onClick={() => void notNow()}
          >
            {t("taskEdit.notNow")}
          </Button>
        </div>
      )}
    </section>
  );
}
