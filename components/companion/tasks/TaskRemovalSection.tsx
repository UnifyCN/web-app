"use client";

import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useTranslation } from "react-i18next";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { stillOwned } from "@/lib/accountSession";
import {
  isRemovalProposal,
  taskRemoveOperation,
  type RemovalProposal,
  type TaskProgress,
} from "@/lib/companionActions/contract";
import {
  isUnresolved,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import {
  useTaskActionClient,
  useTaskActionPhase,
} from "@/hooks/useTaskActions";

type Review =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "failed" }
  | { status: "ready"; proposal: RemovalProposal; changed: boolean };

const noopSubscribe = () => () => {};

/**
 * Removal of one task (mobile-app#367), inside the task panel of the Checklist and
 * Companion drawers. "Remove task" asks the action service for a removal review that
 * names the task and what removing it affects (saved plans, steps kept as history,
 * pending reminders). Only "Remove task" in that review removes it, bound to the
 * reviewed revision; Cancel sends nothing. A change since the review opens a revised
 * review. Mirror of the mobile app's TaskRemovalSection.
 */
export function TaskRemovalSection({
  taskRef,
  taskTitle,
  progress,
  store,
  writable,
}: {
  taskRef: string;
  /** The task's title as the Checklist shows it (content-backed tasks have no server title). */
  taskTitle: string | null;
  progress: TaskProgress;
  store: TaskActionStore | null;
  /** A connection, a fresh read and a live task. */
  writable: boolean;
}) {
  const { t } = useTranslation();
  const ids = useId();
  const bound = useTaskActionClient();
  const phase = useTaskActionPhase(store, taskRef);
  const [review, setReview] = useState<Review>({ status: "idle" });
  const busy = isUnresolved(phase);
  const removeRef = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  // Set by Cancel: focus returns to "Remove task" once the review is gone.
  const focusRemove = useRef(false);

  const requested = useSyncExternalStore(
    store?.subscribe ?? noopSubscribe,
    () => store?.hasRemovalRequest(taskRef) ?? false,
    () => false,
  );

  async function open(proposalId: string | null): Promise<void> {
    if (!bound || progress.removed) return;
    const { client, owner } = bound;
    setReview({ status: "loading" });
    const result = proposalId
      ? await client.removalProposal(proposalId)
      : await client.prepareRemoval(taskRemoveOperation(progress), null);
    // A reply for an account that is no longer signed in reaches no screen.
    if (!stillOwned(owner)) return;
    if (result.kind === "ok" || result.kind === "changed") {
      // A review that was already used names its receipt; a fresh one is prepared instead.
      if (result.proposal.status !== "draft" && proposalId) return open(null);
      setReview({ status: "ready", proposal: result.proposal, changed: false });
    } else {
      setReview({ status: "failed" });
    }
  }

  // A removal asked for from a conversation card or the Checklist drawer.
  useEffect(() => {
    if (!requested || !store) return;
    const proposalId = store.takeRemovalRequest(taskRef);
    if (proposalId !== undefined) void open(proposalId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested, store, taskRef]);

  // The approval found a change since the review: show the revised review, nothing removed.
  const [seenPhase, setSeenPhase] = useState(phase);
  if (phase !== seenPhase) {
    setSeenPhase(phase);
    if (phase.phase === "needs_review" && isRemovalProposal(phase.proposal))
      setReview({ status: "ready", proposal: phase.proposal, changed: true });
  }

  // A shown or revised review takes focus on its heading, so it is read first.
  useEffect(() => {
    if (review.status === "ready") headingRef.current?.focus();
  }, [review]);
  useEffect(() => {
    if (review.status !== "idle" || !focusRemove.current) return;
    focusRemove.current = false;
    removeRef.current?.focus();
  }, [review]);

  function cancel() {
    // Sends nothing: the task, its plans, steps and reminders stay as they are.
    if (phase.phase === "needs_review") store?.dismiss(taskRef);
    focusRemove.current = true;
    setReview({ status: "idle" });
  }

  function confirm() {
    if (review.status !== "ready" || !store || !writable || busy) return;
    const { proposal } = review;
    setReview({ status: "idle" });
    void store.applyOperation(taskRef, proposal.operation, {
      kind: "approved_proposal",
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
      removal_confirmed: true,
    });
  }

  // A removed task (here or on another device) has nothing to remove: no review, no control.
  if (progress.removed) return null;
  // An Undo that met a newer edit already offers its own reviewed change (a removal or a
  // restore) in this panel: one removal control at a time.
  if (phase.phase === "undo_review") return null;

  if (review.status === "ready") {
    const { proposal, changed } = review;
    const effects = proposal.effects;
    const title = effects.title ?? taskTitle;
    const canConfirm =
      writable && !busy && proposal.status === "draft" && !effects.removed;
    return (
      <section
        aria-labelledby={`${ids}-review`}
        data-testid="task-removal-review"
        className="space-y-2 rounded-lg border border-border-card bg-surface-card px-3 py-3"
      >
        <h4
          id={`${ids}-review`}
          ref={headingRef}
          tabIndex={-1}
          className="break-words text-sm font-semibold text-ink-secondary focus-visible:outline-none"
        >
          {title
            ? t("taskRemove.reviewTitle", { title })
            : t("taskRemove.reviewTitleUnknown")}
        </h4>
        {changed && (
          <p role="status" className="text-sm text-destructive-label">
            {t("taskRemove.changed")}
          </p>
        )}
        <ul className="space-y-1 text-sm text-ink-tertiary">
          <li>
            {t("taskRemove.currentState", {
              state: t(`taskActions.state.${effects.state}`),
            })}
          </li>
          <li className="break-words">
            {effects.plans.length > 0
              ? t("taskRemove.effectPlans", {
                  goals: effects.plans.map((p) => p.goal).join(", "),
                })
              : t("taskRemove.effectNoPlans")}
          </li>
          {effects.stepsTotal > 0 && (
            <li>{t("taskRemove.effectSteps", { n: effects.stepsTotal })}</li>
          )}
          {effects.remindersPending > 0 && (
            <li>
              {t("taskRemove.effectReminders", {
                n: effects.remindersPending,
              })}
            </li>
          )}
          <li>{t("taskRemove.effectChecklist")}</li>
        </ul>
        <div className="flex flex-wrap gap-2 pt-1">
          {/* Dark fill as in the reviewed prototype: white on the destructive red is below 4.5:1. */}
          <Button
            type="button"
            size="sm"
            aria-disabled={!canConfirm}
            className={cn(
              "min-h-11 bg-ink-secondary hover:bg-ink",
              !canConfirm && "cursor-not-allowed opacity-60",
            )}
            onClick={confirm}
          >
            {t("taskRemove.confirm")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            className="min-h-11"
            data-drawer-focus=""
            onClick={cancel}
          >
            {t("taskRemove.cancel")}
          </Button>
        </div>
      </section>
    );
  }

  const canStart =
    writable && !busy && Boolean(bound) && review.status !== "loading";
  return (
    <div className="space-y-2 border-t border-border-card pt-4">
      {review.status === "loading" && (
        <p role="status" className="loading-delayed text-sm text-ink-tertiary">
          {t("taskRemove.preparing")}
        </p>
      )}
      {review.status === "failed" && (
        <p role="status" className="text-sm text-destructive-label">
          {t("taskRemove.prepareFailed")}
        </p>
      )}
      <button
        ref={removeRef}
        type="button"
        aria-disabled={!canStart}
        aria-label={
          // The visible text stays part of the name (it changes to "Try again").
          taskTitle && review.status !== "failed"
            ? t("taskRemove.removeTaskA11y", { title: taskTitle })
            : undefined
        }
        onClick={() => canStart && void open(null)}
        className={cn(
          "inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border-card bg-surface px-3 text-sm font-semibold text-destructive-label",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
          canStart
            ? "press cursor-pointer hover:bg-surface-gray"
            : "cursor-not-allowed opacity-60",
        )}
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        {review.status === "failed"
          ? t("taskRemove.tryAgain")
          : t("taskRemove.removeTask")}
      </button>
    </div>
  );
}
