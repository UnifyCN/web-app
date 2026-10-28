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
import { changeLines, editReceiptText, receiptChangeText } from "./editText";

/** A write in flight: a loading state, shown only after the shared 300ms delay. */
const isTransient = (phase: TaskActionPhase) =>
  phase.phase === "saving" || phase.phase === "checking";

/**
 * Compact cards under a conversation message (direction B, mobile-app#363, #365): a
 * task draft or a task change the answer suggested, or the result of a clear command in
 * the user's own message. A draft card says it is not saved; it opens the drawer for
 * review. A result card shows the saved change by its receipt, not by any assistant
 * text.
 */
interface CardsProps {
  message: ChatMessage;
  proposals: TaskProposal[];
  commands: Array<{ messageId: number; receipt: TaskReceipt }>;
  store: TaskActionStore | null;
  /** A connection and a fresh read: a retry is a write. */
  canWrite: boolean;
  onReview: (proposalId: string, kind: TaskProposal["kind"]) => void;
  onViewTask: (taskRef: string) => void;
  /** The account's Checklist title of a task (#365 edits name existing tasks). */
  titleFor?: (taskRef: string) => string | null;
}

export function TaskActionCards({
  message,
  proposals,
  commands,
  store,
  canWrite,
  onReview,
  onViewTask,
  titleFor = () => null,
}: CardsProps) {
  const mine = proposals.filter((p) => p.source?.messageId === message.id);
  const command = commands.find((c) => c.messageId === message.id) ?? null;
  return (
    <>
      {mine.map((p) =>
        p.kind === "task_edit" ? (
          <EditDraftCard
            key={p.proposalId}
            proposal={p}
            store={store}
            title={p.task?.title ?? titleFor(p.operation.task_ref) ?? null}
            onReview={() => onReview(p.proposalId, p.kind)}
          />
        ) : (
          <DraftCard
            key={p.proposalId}
            proposal={p}
            store={store}
            onReview={() => onReview(p.proposalId, p.kind)}
          />
        ),
      )}
      {message.role === "user" && (
        <CommandCard
          messageId={message.id}
          saved={command?.receipt ?? null}
          store={store}
          canWrite={canWrite}
          onViewTask={onViewTask}
          titleFor={titleFor}
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
  proposal: Extract<TaskProposal, { kind: "task_create" }>;
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
        <p
          className={cn(
            "text-xs text-ink-tertiary",
            !saved && isTransient(phase) && "loading-delayed",
          )}
        >
          {status}
        </p>
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

/** A suggested change to an existing task (#365): what it changes, not yet saved. */
function EditDraftCard({
  proposal,
  store,
  title,
  onReview,
}: {
  proposal: Extract<TaskProposal, { kind: "task_edit" }>;
  store: TaskActionStore | null;
  title: string | null;
  onReview: () => void;
}) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, `proposal:${proposal.proposalId}`);
  const saved = phase.phase === "saved" ? phase.receipt : proposal.receipt;
  const draft = proposal.status === "draft" && !saved;
  const name = title ?? t("taskEdit.unknownTask");
  const summary = changeLines(t as never, proposal.operation, proposal.task)
    .map((line) => `${line.label}: ${line.to}`)
    .join(" · ");
  const status = saved
    ? t("taskEdit.saved")
    : proposal.status === "cancelled"
      ? t("taskEdit.closed")
      : isUnresolved(phase)
        ? t("taskActions.checking")
        : t("taskEdit.draftBadge");
  return (
    <article
      aria-label={`${t("taskEdit.cardEyebrow")}: ${name}`}
      className={cn(CARD, draft && "border-dashed")}
    >
      <CardIcon />
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-ink-muted">
          {t("taskEdit.cardEyebrow")}
        </p>
        <p className="break-words text-sm font-semibold text-ink-secondary">
          {name}
        </p>
        <p className="break-words text-xs text-ink-tertiary">{summary}</p>
        <p
          className={cn(
            "text-xs text-ink-tertiary",
            !saved && isTransient(phase) && "loading-delayed",
          )}
        >
          {status}
        </p>
      </div>
      <CardButton
        label={draft ? t("taskEdit.review") : t("taskEdit.view")}
        name={
          draft ? t("taskEdit.reviewA11y", { title: name }) : t("taskEdit.view")
        }
        onClick={onReview}
      />
    </article>
  );
}

function commandText(
  t: (k: string, o?: Record<string, unknown>) => string,
  phase: TaskActionPhase,
  titleFor: (taskRef: string) => string | null,
): string | null {
  switch (phase.phase) {
    case "saving":
    case "checking": {
      const op = phase.write.operation;
      if (op && op.type !== "task.create_custom") {
        return t("taskEdit.commandSaving", {
          title:
            ("task_ref" in op ? titleFor(op.task_ref) : null) ??
            t("taskEdit.unknownTask"),
        });
      }
      return t("taskCreate.commandAdding", {
        title: op?.type === "task.create_custom" ? op.title : "",
      });
    }
    case "conflict":
      return t("taskEdit.commandConflict");
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
  titleFor,
}: {
  messageId: number;
  saved: TaskReceipt | null;
  store: TaskActionStore | null;
  canWrite: boolean;
  onViewTask: (taskRef: string) => void;
  titleFor: (taskRef: string) => string | null;
}) {
  const { t } = useTranslation();
  const key = `command:${messageId}`;
  const phase = useTaskActionPhase(store, key);
  const receipt = phase.phase === "saved" ? phase.receipt : saved;
  if (
    receipt &&
    (receipt.operationType === "task.edit_details" ||
      receipt.operationType === "task.set_state")
  ) {
    // #365: a clear edit command's saved change, named field by field.
    const title =
      receipt.title ?? titleFor(receipt.taskRef) ?? t("taskEdit.unknownTask");
    return (
      <article
        aria-label={editReceiptText(t as never, receipt, title)}
        className={CARD}
      >
        <CardIcon />
        <div className="min-w-0 flex-1" role="status">
          <p className="break-words text-sm text-ink-secondary">
            {editReceiptText(t as never, receipt, title)}
          </p>
          {receipt.changes.map((change) => (
            <p
              key={change.field}
              className="break-words text-xs text-ink-tertiary"
            >
              {receiptChangeText(t as never, change)}
            </p>
          ))}
          {!receipt.current && (
            <p className="text-xs text-ink-muted">
              {t("taskActions.receiptHistorical")}
            </p>
          )}
        </div>
        <CardButton
          label={t("taskCreate.view")}
          name={t("taskEdit.viewA11y", { title })}
          onClick={() => onViewTask(receipt.taskRef)}
        />
      </article>
    );
  }
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
  const text = commandText(t as never, phase, titleFor);
  if (!text) return null;
  return (
    <div
      className={cn(CARD, isTransient(phase) && "loading-delayed")}
      role="status"
    >
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
