"use client";

import { useState, type ReactNode } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, CloudOff } from "lucide-react";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";
import { stillOwned, type AccountOwner } from "@/lib/accountSession";
import {
  planTaskTitle,
  type PlanClient,
  type PlanProposalResult,
} from "@/lib/companionActions/planClient";
import type {
  PlanDraftItem,
  PlanProposal,
  PlanReceipt,
  PlanTaskNow,
  PlanView,
} from "@/lib/companionActions/planContract";
import {
  isPlanUnresolved,
  proposalKey,
  receiptKey,
  type PlanPhase,
  type PlanStore,
} from "@/lib/companionActions/planStore";
import type { TaskState } from "@/lib/companionActions/contract";
import { planProposalKey } from "@/lib/companionActions/queryKeys";
import {
  usePlanClient,
  usePlanPhase,
  usePlanProposal,
  usePlans,
  usePlanStore,
} from "@/hooks/usePlans";
import { useTaskProgress } from "@/hooks/useTaskActions";
import { planReceiptSummary, recordedTitles } from "./planText";
import type { PlanTarget } from "./PlanEntry";

const BUTTON =
  "press inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg border border-border-card bg-surface px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-disabled:cursor-not-allowed aria-disabled:opacity-60";
const PRIMARY =
  "press inline-flex min-h-11 cursor-pointer items-center justify-center rounded-lg bg-ink-secondary px-4 text-sm font-semibold text-white hover:bg-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

/** A write in flight: shown only after the shared 300ms delay. */
const isTransient = (phase: PlanPhase) => phase.phase === "saving" || phase.phase === "checking";

/**
 * Review and resume of a settlement plan (mobile-app#364) in the direction B overlay
 * drawer. A draft shows which tasks are reused (with their current state) and which
 * would be added, the profile values it depends on, and one approval control that names
 * the real change count. Every edit is a new revision that needs its own approval and
 * never changes saved progress. A saved plan reads each task's current state from the
 * shared Checklist rows, keeps its receipt's recorded meaning, and offers
 * receipt-specific Retry and Undo. Writes need a fresh read and a connection; nothing
 * is queued offline.
 */
export function PlanPanel({
  target,
  onOpenTask,
}: {
  target: PlanTarget;
  onOpenTask: (taskRef: string) => void;
}) {
  if ("proposalId" in target)
    return <DraftOrSaved proposalId={target.proposalId} onOpenTask={onOpenTask} />;
  return (
    <SavedPlan planId={target.planId} fallback={null} receipt={null} note={null} onOpenTask={onOpenTask} />
  );
}

function DraftOrSaved({
  proposalId,
  onOpenTask,
}: {
  proposalId: string;
  onOpenTask: (taskRef: string) => void;
}) {
  const { t } = useTranslation();
  const store = usePlanStore("companion");
  const query = usePlanProposal(proposalId);
  const phase = usePlanPhase(store, proposalKey(proposalId));
  const fromPhase =
    phase.phase === "needs_review" || phase.phase === "changed" ? phase.proposal : null;
  const proposal =
    fromPhase && fromPhase.revision >= (query.data?.revision ?? 0) ? fromPhase : query.data;
  if (!proposal) {
    return (
      <p role="status" className={cn("text-sm text-ink-muted", !query.isError && "loading-delayed")}>
        {query.isError ? t("plans.planUnavailable") : t("plans.loadingPlan")}
      </p>
    );
  }
  const reply = phase.phase === "saved" ? phase.reply : null;
  if (reply || proposal.status === "applied") {
    return (
      <SavedPlan
        planId={reply?.plan?.planId ?? proposal.planId}
        fallback={reply?.plan ?? null}
        receipt={reply?.receipt ?? proposal.receipt}
        note={phase.phase === "changed" ? t("plans.changedElsewhere") : null}
        onOpenTask={onOpenTask}
      />
    );
  }
  return <DraftReview proposal={proposal} store={store} phase={phase} />;
}

const PROFILE_FIELDS = [
  ["city", "taskCreate.profileCity"],
  ["province", "taskCreate.profileProvince"],
  ["arrivalDate", "taskCreate.profileArrival"],
] as const;

function DraftReview({
  proposal,
  store,
  phase,
}: {
  proposal: PlanProposal;
  store: PlanStore | null;
  phase: PlanPhase;
}) {
  const { t, i18n } = useTranslation();
  const key = proposalKey(proposal.id);
  const view = useTaskProgress();
  const queryClient = useQueryClient();
  const bound = usePlanClient();
  const [request, setRequest] = useState<{ owner: AccountOwner; state: "busy" | "failed" } | null>(null);
  const ownRequest =
    request &&
    bound &&
    request.owner.accountId === bound.owner.accountId &&
    request.owner.epoch === bound.owner.epoch
      ? request.state
      : null;
  const busy = isPlanUnresolved(phase) || ownRequest === "busy";
  const draft = proposal.status === "draft";
  const writable = Boolean(store && bound) && view.canWrite && draft;
  const canEdit = writable && !busy;
  const canApprove = canEdit && proposal.unresolved.length === 0;
  const tasks = new Map(proposal.tasks.map((task) => [task.taskRef, task]));

  async function edit(run: (c: PlanClient) => Promise<PlanProposalResult>) {
    if (!bound || !stillOwned(bound.owner)) return;
    const { client, owner } = bound;
    setRequest({ owner, state: "busy" });
    const result = await run(client);
    // A late reply after another account or session is dropped.
    if (!stillOwned(owner)) return;
    if (result.kind === "ok" || result.kind === "changed") {
      setRequest(null);
      queryClient.setQueryData(planProposalKey(owner.accountId, proposal.id), result.proposal);
      // A saved edit is a new revision: an earlier not-applied approval cannot apply.
      store?.supersedeNotApplied(key);
      store?.dismiss(key);
      return;
    }
    setRequest({ owner, state: "failed" });
  }
  const replaceItem = (index: number, next: PlanDraftItem[]) => {
    if (!canEdit) return;
    const items = [...proposal.items.slice(0, index), ...next, ...proposal.items.slice(index + 1)];
    void edit((c) => c.revise(proposal.id, proposal.revision, items));
  };

  const reviewNote = proposal.reviewReason
    ? t(
        proposal.reviewReason === "edited"
          ? "plans.reviewEdited"
          : proposal.reviewReason === "context_changed"
            ? "plans.reviewContextChanged"
            : "plans.reviewRestored",
      )
    : null;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);
  const profile = proposal.context?.profile;
  const before =
    proposal.reviewReason === "context_changed" ? proposal.previousContext?.profile : null;
  const approveLabel =
    proposal.changeCount > 0
      ? t("plans.approve", { count: proposal.changeCount })
      : t("plans.saveExisting");

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-ink-muted">{t("plans.draftBadge")}</p>
        <h3 className="mt-1 break-words text-lg font-semibold text-ink">{proposal.goal}</h3>
      </div>
      {view.stale && <Notice>{t("taskActions.offline")}</Notice>}
      {reviewNote && (
        <p className="rounded-lg border border-primary-subtle bg-primary-bg p-3 text-sm text-ink">{reviewNote}</p>
      )}

      <section className="space-y-1">
        <h4 className="text-xs font-semibold text-ink">{t("taskCreate.basedOn")}</h4>
        {PROFILE_FIELDS.some(([f]) => profile?.[f]) ? (
          PROFILE_FIELDS.map(([field, label]) => {
            const value = profile?.[field];
            if (!value) return null;
            const shown = field === "arrivalDate" ? formatDate(value, i18n.language) : value;
            const old = before?.[field];
            return (
              <div key={field}>
                <p className="text-sm text-ink-secondary">{t(label, { value: shown })}</p>
                {before && old && old !== value && (
                  <p className="text-xs text-ink-muted">
                    {t("taskCreate.before", {
                      value: field === "arrivalDate" ? formatDate(old, i18n.language) : old,
                    })}
                  </p>
                )}
              </div>
            );
          })
        ) : (
          <p className="text-sm text-ink-secondary">{t("taskCreate.noProfile")}</p>
        )}
      </section>

      <section className="space-y-1">
        <h4 className="text-xs font-semibold text-ink">{t("plans.existingSection")}</h4>
        <ul className="divide-y divide-border-card">
          {proposal.items.map((item, index) => {
            if (item.kind !== "existing") return null;
            const now = tasks.get(item.taskRef);
            const title = (now && planTaskTitle(now)) ?? item.label ?? t("plans.untitledTask");
            const removed = now?.removed ?? false;
            return (
              <li key={item.taskRef} className="flex items-center gap-3 py-2">
                <span className="min-w-0 flex-1">
                  <span className="block break-words text-sm font-medium text-ink">{title}</span>
                  <span className={cn("block text-xs", removed ? "text-destructive-label" : "text-ink-muted")}>
                    {removed
                      ? t("plans.removedFromChecklist")
                      : t("plans.alreadyInChecklist", { state: stateLabel(now?.state ?? "not_started") })}
                  </span>
                </span>
                {removed && (
                  <button
                    type="button"
                    className={BUTTON}
                    aria-label={t("plans.dropA11y", { title })}
                    aria-disabled={!canEdit}
                    onClick={() => replaceItem(index, [])}
                  >
                    {t("plans.dropFromPlan")}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      </section>

      {proposal.items.some((i) => i.kind === "new") && (
        <section className="space-y-1">
          <h4 className="text-xs font-semibold text-ink">{t("plans.newSection")}</h4>
          <ul className="divide-y divide-border-card">
            {proposal.items.map((item, index) => {
              if (item.kind !== "new") return null;
              const match = (proposal.context?.matches[item.key] ?? [])[0];
              const unresolved = proposal.unresolved.includes(item.key);
              const matchTask = match ? tasks.get(match.taskRef) : undefined;
              const matchTitle = match ? (match.title ?? (matchTask && planTaskTitle(matchTask)) ?? item.title) : null;
              const id = `plan-${proposal.id}-${item.key}`;
              return (
                <li key={item.key} className="space-y-2 py-2">
                  <label htmlFor={id} className="flex min-h-11 cursor-pointer items-center gap-3">
                    <input
                      id={id}
                      type="checkbox"
                      className="h-5 w-5 shrink-0 accent-primary"
                      checked={item.include}
                      aria-label={t("plans.includeA11y", { title: item.title })}
                      aria-disabled={!canEdit}
                      onChange={() => replaceItem(index, [{ ...item, include: !item.include }])}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block break-words text-sm font-medium text-ink">{item.title}</span>
                      <span className="block text-xs text-ink-muted">
                        {item.include ? t("plans.newTaskToAdd") : t("plans.notIncluded")}
                      </span>
                    </span>
                  </label>
                  {item.include && match && (unresolved || item.confirmNew) && (
                    <div className="ms-8 space-y-2">
                      <p className="text-sm text-ink-secondary">
                        {item.confirmNew ? t("plans.keptAsNew") : t("plans.possibleMatch", { title: matchTitle })}
                      </p>
                      {unresolved && (
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            className={BUTTON}
                            aria-disabled={!canEdit}
                            onClick={() =>
                              replaceItem(index, [{ kind: "existing", taskRef: match.taskRef, label: null }])
                            }
                          >
                            {t("plans.useExisting")}
                          </button>
                          <button
                            type="button"
                            className={BUTTON}
                            aria-disabled={!canEdit}
                            onClick={() => replaceItem(index, [{ ...item, confirmNew: true }])}
                          >
                            {t("plans.addAsNew")}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </section>
      )}

      <div className="space-y-2">
        {proposal.status === "cancelled" && <p className="text-sm text-ink-secondary">{t("plans.cardClosed")}</p>}
        <p role="status" className="text-sm text-ink-secondary">
          {ownRequest === "busy" ? (
            <span className="loading-delayed">{t("plans.updating")}</span>
          ) : draft && proposal.unresolved.length > 0 ? (
            t("plans.resolveFirst")
          ) : null}
        </p>
        {ownRequest === "failed" && <p role="alert" className="text-sm text-destructive-label">{t("plans.editFailed")}</p>}
        <PhaseLine phase={phase} store={store} storeKey={key} writable={writable && ownRequest !== "busy"} />
      </div>

      {draft && (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={PRIMARY}
            aria-disabled={!canApprove}
            onClick={() => canApprove && void store?.approve(proposal)}
          >
            {approveLabel}
          </button>
          <button
            type="button"
            className={BUTTON}
            aria-disabled={!canEdit}
            onClick={() => canEdit && void edit((c) => c.cancel(proposal.id, proposal.revision))}
          >
            {t("taskCreate.notNow")}
          </button>
        </div>
      )}
    </div>
  );
}

function SavedPlan({
  planId,
  fallback,
  receipt: given,
  note,
  onOpenTask,
}: {
  planId: string | null;
  fallback: PlanView | null;
  receipt: PlanReceipt | null;
  note: string | null;
  onOpenTask: (taskRef: string) => void;
}) {
  const { t } = useTranslation();
  const plans = usePlans();
  const store = usePlanStore("companion");
  const view = useTaskProgress();
  const plan = plans.plans.find((p) => p.planId === planId) ?? fallback;
  const receipt = plan?.receipt ?? given;
  const undoKey = receipt ? receiptKey(receipt.operationId) : null;
  const phase = usePlanPhase(store, undoKey);
  const compensation = phase.phase === "undo_review" ? phase.proposal : null;
  const compPhase = usePlanPhase(store, compensation ? proposalKey(compensation.id) : null);
  const [confirming, setConfirming] = useState(false);
  const [instantUndo, setInstantUndo] = useState(false);
  const [instantReview, setInstantReview] = useState(true);
  const busy = isPlanUnresolved(phase) || isPlanUnresolved(compPhase);
  const writable = Boolean(store) && view.canWrite && !busy;

  const undone =
    (phase.phase === "saved" && phase.reply.receipt.kind === "plan_undo" ? phase.reply.receipt : null) ??
    (compPhase.phase === "saved" ? compPhase.reply.receipt : null);
  if (!plan && !undone) {
    return (
      <p role="status" className={cn("text-sm text-ink-muted", plans.status !== "ready" && "loading-delayed")}>
        {plans.status === "ready" ? t("plans.undoneBadge") : t("plans.loadingPlan")}
      </p>
    );
  }
  const added = receipt?.results.filter((r) => r.outcome === "created") ?? [];
  const failed =
    receipt?.results.filter((r) => r.outcome === "failed" && receipt.retryable.includes(r.key ?? "")) ?? [];
  const retried = phase.phase === "saved" && phase.reply.receipt.kind === "plan_retry" ? phase.reply.receipt : null;
  const stateLabel = (s: TaskState) => t(`taskActions.state.${s}`);

  return (
    <div className="space-y-5">
      <div>
        <p className="text-xs text-ink-muted">{undone ? t("plans.undoneBadge") : t("plans.savedBadge")}</p>
        <h3 className="mt-1 break-words text-lg font-semibold text-ink">{plan?.goal ?? ""}</h3>
      </div>
      {note && <p className="text-sm text-ink-secondary">{note}</p>}
      {view.stale && <Notice>{t("taskActions.offline")}</Notice>}

      {!undone && plan && (
        <ul className="divide-y divide-border-card">
          {plan.items.map((task) => (
            <PlanTaskRow key={task.taskRef} task={task} stateLabel={stateLabel} onOpenTask={onOpenTask} />
          ))}
        </ul>
      )}

      <div className="space-y-3">
        {undone ? (
          <p role="status" tabIndex={-1} data-drawer-focus="" className="text-sm font-semibold text-ink">
            {planReceiptSummary(t, undone)}
          </p>
        ) : receipt ? (
          <>
            <p role="status" tabIndex={-1} data-drawer-focus="" className="text-sm font-semibold text-ink">
              {planReceiptSummary(t, receipt)}
            </p>
            {retried && <p className="text-sm text-ink-secondary">{planReceiptSummary(t, retried)}</p>}
            {failed.length > 0 && (
              <p className="text-sm text-destructive-label">{t("plans.receiptFailed", { titles: recordedTitles(failed, t) })}</p>
            )}
            <div className="flex flex-wrap gap-2">
              {failed.length > 0 && !receipt.undoneBy && (
                <button
                  type="button"
                  className={BUTTON}
                  aria-disabled={!writable}
                  onClick={() => writable && void store?.retryFailed(receipt.operationId)}
                >
                  {t("plans.retryFailed", { count: failed.length })}
                </button>
              )}
              {receipt.undoable && !confirming && phase.phase !== "undo_review" && (
                <button
                  type="button"
                  className={BUTTON}
                  aria-disabled={!writable}
                  onClick={(event) => {
                    if (!writable) return;
                    setInstantUndo(event.detail === 0);
                    setConfirming(true);
                  }}
                >
                  {t("plans.undo")}
                </button>
              )}
            </div>
            <Reveal open={confirming} instant={instantUndo}>
              <div role="group" className="space-y-2 rounded-lg border border-primary-subtle bg-primary-bg p-3">
                <p className="text-sm text-ink">
                  {receipt.removalCount > 0
                    ? t("plans.confirmUndo", { count: added.length, titles: recordedTitles(added, t) })
                    : t("plans.confirmUndoNone")}
                </p>
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    className={PRIMARY}
                    aria-disabled={!writable}
                    onClick={(event) => {
                      if (!writable) return;
                      setInstantReview(event.detail === 0);
                      setConfirming(false);
                      // The confirmation above is the user's explicit removal confirmation.
                      void store?.undo(receipt.operationId, { removalConfirmed: receipt.removalCount > 0 });
                    }}
                  >
                    {t("plans.undoConfirm")}
                  </button>
                  <button type="button" className={BUTTON} data-drawer-focus="" onClick={() => setConfirming(false)}>
                    {t("plans.keepPlan")}
                  </button>
                </div>
              </div>
            </Reveal>
            <Reveal open={Boolean(compensation) && compPhase.phase !== "saved"} instant={instantReview}>
              {compensation && (
                <div role="group" className="space-y-2 rounded-lg border border-primary-subtle bg-primary-bg p-3">
                  <p className="text-sm text-ink">
                    {t("plans.undoConflict", {
                      titles: (phase.phase === "undo_review" ? phase.current : [])
                        .map((c) => c.title ?? t("plans.untitledTask"))
                        .join(", "),
                    })}
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className={PRIMARY}
                      aria-disabled={!writable}
                      onClick={() =>
                        writable && void store?.approve(compensation, { removalConfirmed: compensation.changeCount > 0 })
                      }
                    >
                      {t("plans.undoTheRest")}
                    </button>
                    <button type="button" className={BUTTON} onClick={() => undoKey && store?.dismiss(undoKey)}>
                      {t("plans.keepPlan")}
                    </button>
                  </div>
                </div>
              )}
            </Reveal>
            <PhaseLine
              phase={compensation ? compPhase : phase}
              store={store}
              storeKey={compensation ? proposalKey(compensation.id) : (undoKey ?? "")}
              writable={Boolean(store) && view.canWrite}
            />
          </>
        ) : null}
      </div>
    </div>
  );
}

function PlanTaskRow({
  task,
  stateLabel,
  onOpenTask,
}: {
  task: PlanTaskNow;
  stateLabel: (s: TaskState) => string;
  onOpenTask: (taskRef: string) => void;
}) {
  const { t } = useTranslation();
  const title = planTaskTitle(task) ?? t("plans.untitledTask");
  const state = task.removed ? t("plans.taskRemoved") : stateLabel(task.state);
  const Icon = task.state === "completed" && !task.removed ? CheckCircle2 : Circle;
  return (
    <li>
      <button
        type="button"
        aria-label={t("plans.taskRowA11y", { title, state })}
        // A removed task is never opened or recreated from the plan.
        aria-disabled={task.removed}
        onClick={() => !task.removed && onOpenTask(task.taskRef)}
        className="press-dim flex min-h-12 w-full cursor-pointer items-center gap-3 rounded py-2 text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary aria-disabled:cursor-not-allowed"
      >
        <Icon className={cn("h-5 w-5 shrink-0", task.removed ? "text-ink-muted" : "text-primary")} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className={cn("block break-words text-sm font-medium", task.removed ? "text-ink-muted" : "text-ink")}>
            {title}
          </span>
          <span className="block text-xs text-ink-muted">{state}</span>
        </span>
      </button>
    </li>
  );
}

function PhaseLine({
  phase,
  store,
  storeKey,
  writable,
}: {
  phase: PlanPhase;
  store: PlanStore | null;
  storeKey: string;
  writable: boolean;
}) {
  const { t } = useTranslation();
  const text = (s: string, error = false) => (
    <p role={error ? "alert" : "status"} className={cn("text-sm", error ? "text-destructive-label" : "text-ink-secondary")}>
      {s}
    </p>
  );
  if (isTransient(phase))
    return (
      <p role="status" className="loading-delayed text-sm text-ink-secondary">
        {phase.phase === "saving" ? t("taskActions.saving") : t("taskActions.checking")}
      </p>
    );
  switch (phase.phase) {
    case "pending":
    case "lookup_failed":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {text(t(phase.phase === "pending" ? "taskActions.pending" : "taskActions.lookupFailed"), true)}
          <button type="button" className={BUTTON} onClick={() => void store?.checkAgain(storeKey)}>
            {t("taskActions.checkAgain")}
          </button>
        </div>
      );
    case "not_applied":
      return (
        <div className="flex flex-wrap items-center gap-2">
          {text(t("taskActions.notApplied"), true)}
          <button
            type="button"
            className={BUTTON}
            aria-disabled={!writable}
            onClick={() => writable && void store?.retrySame(storeKey)}
          >
            {t("taskActions.retry")}
          </button>
        </div>
      );
    case "refused":
      return text(phase.reason === "task_removed" ? t("taskActions.removed") : t("taskActions.refused"), true);
    case "already_undone":
      return text(t("plans.alreadyUndone"));
    case "unavailable":
      return text(t("taskActions.unavailable"), true);
    case "signed_out":
      return text(t("taskActions.signedOut"), true);
    default:
      return null;
  }
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <p className="flex items-start gap-2 rounded-lg bg-surface-gray p-3 text-xs text-ink-secondary">
      <CloudOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      {children}
    </p>
  );
}

function formatDate(value: string, language: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(language, { year: "numeric", month: "long", day: "numeric", timeZone: "UTC" }).format(d);
}
