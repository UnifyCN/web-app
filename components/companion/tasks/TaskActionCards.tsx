"use client";

import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react";
import { cn } from "@/lib/utils";
import type {
  TaskProposal,
  TaskReceipt,
} from "@/lib/companionActions/contract";
import type {
  TaskActionPhase,
  TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import { isUnresolved } from "@/lib/companionActions/taskActionStore";
import { useTaskActionPhase } from "@/hooks/useTaskActions";
import type { ChatMessage } from "@/types";

/**
 * Compact cards under a conversation message (direction B, mobile-app#363): a task
 * draft the answer suggested, or the result of a clear command in the user's own
 * message. A draft card says it is not saved; it opens the drawer for review. A
 * result card shows the saved task by its receipt, not by any assistant text.
 */
interface CardsProps {
  message: ChatMessage;
  proposals: TaskProposal[];
  commands: Array<{ messageId: number; receipt: TaskReceipt }>;
  store: TaskActionStore | null;
  /** A connection and a fresh read: a retry is a write. */
  canWrite: boolean;
  onReview: (proposalId: string) => void;
  onViewTask: (taskRef: string) => void;
}

export function TaskActionCards({
  message,
  proposals,
  commands,
  store,
  canWrite,
  onReview,
  onViewTask,
}: CardsProps) {
  const mine = proposals.filter((p) => p.source?.messageId === message.id);
  const command = commands.find((c) => c.messageId === message.id) ?? null;
  return (
    <>
      {mine.map((p) => (
        <DraftCard
          key={p.proposalId}
          proposal={p}
          store={store}
          onReview={() => onReview(p.proposalId)}
        />
      ))}
      {message.role === "user" && (
        <CommandCard
          messageId={message.id}
          saved={command?.receipt ?? null}
          store={store}
          canWrite={canWrite}
          onViewTask={onViewTask}
        />
      )}
    </>
  );
}

const CARD =
  "mt-2 flex items-center gap-3 rounded-xl border border-border-card bg-surface px-3 py-2.5";

function CardIcon() {
  return (
    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg">
      <ListChecks className="h-4 w-4 text-ink-secondary" aria-hidden />
    </span>
  );
}

function CardButton({
  label,
  name,
  onClick,
  disabled = false,
}: {
  label: string;
  name: string;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={name}
      aria-disabled={disabled}
      className={cn(
        disabled && "cursor-not-allowed opacity-60",
        "press inline-flex min-h-11 shrink-0 cursor-pointer items-center rounded-lg border border-border-card px-3 text-sm font-semibold text-ink-secondary hover:bg-surface-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
      )}
    >
      {label}
    </button>
  );
}

function DraftCard({
  proposal,
  store,
  onReview,
}: {
  proposal: TaskProposal;
  store: TaskActionStore | null;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, `proposal:${proposal.proposalId}`);
  const title = proposal.operation.title;
  const saved = phase.phase === "saved" ? phase.receipt : proposal.receipt;
  const status = saved
    ? t("taskCreate.added", { title: saved.title ?? title })
    : proposal.status === "cancelled"
      ? t("taskCreate.closed")
      : isUnresolved(phase)
        ? t("taskActions.checking")
        : t("taskCreate.draftBadge");
  return (
    <article
      aria-label={t("taskCreate.cardA11y", { title })}
      className={cn(
        CARD,
        proposal.status === "draft" && !saved && "border-dashed",
      )}
    >
      <CardIcon />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-muted">
          {t("taskCreate.cardEyebrow")}
        </p>
        <p className="break-words text-sm font-semibold text-ink-secondary">
          {title}
        </p>
        <p className="text-xs text-ink-tertiary">{status}</p>
      </div>
      {/* One control that keeps its place when the draft is saved, so focus can return to it. */}
      <CardButton
        label={
          saved || proposal.status !== "draft"
            ? t("taskCreate.view")
            : t("taskCreate.review")
        }
        name={
          saved || proposal.status !== "draft"
            ? t("taskCreate.view")
            : t("taskCreate.reviewA11y", { title })
        }
        onClick={onReview}
      />
    </article>
  );
}

function commandText(
  t: (k: string, o?: Record<string, unknown>) => string,
  phase: TaskActionPhase,
): string | null {
  switch (phase.phase) {
    case "saving":
    case "checking":
      return t("taskCreate.commandAdding", {
        title:
          phase.write.operation?.type === "task.create_custom"
            ? phase.write.operation.title
            : "",
      });
    case "pending":
      return t("taskActions.pending");
    case "lookup_failed":
      return t("taskActions.lookupFailed");
    case "not_applied":
      return t("taskActions.notApplied");
    case "command_used":
      return t("taskCreate.commandUsed");
    case "needs_clarification":
      return t("taskCreate.needsClarification");
    case "refused":
      return t("taskActions.refused");
    case "unavailable":
      return t("taskActions.unavailable");
    case "signed_out":
      return t("taskActions.signedOut");
    default:
      return null;
  }
}

function CommandCard({
  messageId,
  saved,
  store,
  canWrite,
  onViewTask,
}: {
  messageId: number;
  saved: TaskReceipt | null;
  store: TaskActionStore | null;
  canWrite: boolean;
  onViewTask: (taskRef: string) => void;
}) {
  const { t } = useTranslation();
  const key = `command:${messageId}`;
  const phase = useTaskActionPhase(store, key);
  const receipt = phase.phase === "saved" ? phase.receipt : saved;
  if (receipt) {
    const title = receipt.title ?? "";
    return (
      <article
        aria-label={t("taskCreate.addedCardA11y", { title })}
        className={CARD}
      >
        <CardIcon />
        <p
          className="min-w-0 flex-1 break-words text-sm text-ink-secondary"
          role="status"
        >
          {receipt.operationType === "task.remove_created"
            ? t("taskCreate.removed", { title })
            : t("taskCreate.added", { title })}
        </p>
        <CardButton
          label={t("taskCreate.view")}
          name={t("taskCreate.view")}
          onClick={() => onViewTask(receipt.taskRef)}
        />
      </article>
    );
  }
  const text = commandText(t as never, phase);
  if (!text) return null;
  return (
    <div className={CARD} role="status">
      <CardIcon />
      <p className="min-w-0 flex-1 break-words text-sm text-ink-tertiary">
        {text}
      </p>
      {(phase.phase === "pending" || phase.phase === "lookup_failed") && (
        <CardButton
          label={t("taskActions.checkAgain")}
          name={t("taskActions.checkAgain")}
          onClick={() => void store?.checkAgain(key)}
        />
      )}
      {phase.phase === "not_applied" && (
        <CardButton
          label={t("taskActions.retry")}
          name={t("taskActions.retry")}
          disabled={!canWrite}
          onClick={() => canWrite && void store?.retry(key)}
        />
      )}
    </div>
  );
}
