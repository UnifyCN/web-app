"use client";

import { useId, useState, useSyncExternalStore } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { WifiOff } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import {
  TITLE_MAX,
  createTaskOperation,
  type ProposalContext,
  type TaskProposal,
} from "@/lib/companionActions/contract";
import { taskProposalKey } from "@/lib/companionActions/queryKeys";
import {
  isUnresolved,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import {
  useTaskActionClient,
  useTaskActionPhase,
  useTaskProposal,
  type TaskProgressView,
} from "@/hooks/useTaskActions";
import { useAccountId } from "@/hooks/useAccountId";
import { ReceiptBlock } from "./ReceiptBlock";
import { PhaseMessage } from "./TaskStatePanel";

interface TaskProposalPanelProps {
  proposalId: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
}

const PROFILE_FIELDS = [
  ["city", "taskCreate.profileCity"],
  ["province", "taskCreate.profileProvince"],
  ["arrivalDate", "taskCreate.profileArrival"],
] as const;

/**
 * Review of one server-owned task draft (mobile-app#363), direction B drawer. The
 * draft is not saved work: it shows its exact title, the profile context it was
 * prepared against, any task with the same title, and one approval control that
 * names the change. Approval binds to the shown revision; an edited title or a
 * changed profile needs a new approval. Every write needs a connection and a fresh
 * read; offline nothing is sent or queued.
 */
export function TaskProposalPanel({
  proposalId,
  view,
  store,
}: TaskProposalPanelProps) {
  const { t, i18n } = useTranslation();
  const ids = useId();
  const key = `proposal:${proposalId}`;
  const queryClient = useQueryClient();
  const userId = useAccountId() ?? null;
  const client = useTaskActionClient();
  const query = useTaskProposal(proposalId);
  const phase = useTaskActionPhase(store, key);
  const titleDraft = useSyncExternalStore(
    store?.subscribe ?? (() => () => {}),
    () => store?.draft(key),
    () => undefined,
  );
  const [requestBusy, setRequestBusy] = useState(false);
  const [requestFailed, setRequestFailed] = useState(false);

  // A refreshed revision from a needs-review reply is newer than the last read.
  const proposal: TaskProposal | undefined =
    phase.phase === "needs_review" &&
    phase.proposal.proposalRevision >= (query.data?.proposalRevision ?? 0)
      ? phase.proposal
      : query.data;

  if (!proposal) {
    return query.isError ? (
      <p className="text-sm text-ink-muted">
        {t("taskCreate.draftUnavailable")}
      </p>
    ) : (
      <p role="status" className="loading-delayed text-sm text-ink-muted">
        {t("taskCreate.loadingDraft")}
      </p>
    );
  }

  const busy = isUnresolved(phase) || requestBusy;
  const writable =
    Boolean(store && client) && view.canWrite && proposal.status === "draft";
  const canWrite = writable && !busy;
  const savedTitle = proposal.operation.title;
  const title = titleDraft ?? savedTitle;
  const edited = title.trim() !== savedTitle;
  const titleValid =
    title.trim().length > 0 &&
    title.trim().length <= TITLE_MAX &&
    !/[\n\r]/.test(title);
  const shownTitle = edited ? title.trim() : savedTitle;
  const receipt = phase.phase === "saved" ? phase.receipt : proposal.receipt;

  const keep = (next: TaskProposal) =>
    queryClient.setQueryData(taskProposalKey(userId, proposalId), next);

  async function proposalRequest(
    run: () => ReturnType<NonNullable<typeof client>["cancel"]>,
  ) {
    setRequestBusy(true);
    setRequestFailed(false);
    const result = await run();
    setRequestBusy(false);
    if (result.kind === "ok" || result.kind === "changed") {
      keep(result.proposal);
      return result;
    }
    setRequestFailed(true);
    return null;
  }

  async function saveTitle() {
    if (!canWrite || !client || !edited || !titleValid) return;
    const submitted = title;
    const result = await proposalRequest(() =>
      client.revise(
        proposal!.proposalId,
        proposal!.proposalRevision,
        createTaskOperation(submitted),
      ),
    );
    // Clear the typed title only when this edit is the saved one.
    if (result?.kind === "ok" && (store?.draft(key) ?? submitted) === submitted)
      store?.setDraft(key, undefined);
  }

  function approve() {
    if (!canWrite || !store || edited) return;
    store.dismiss(key);
    void store.applyOperation(key, proposal!.operation, {
      kind: "approved_proposal",
      proposal_id: proposal!.proposalId,
      proposal_revision: proposal!.proposalRevision,
    });
  }

  function notNow() {
    if (!canWrite || !client) return;
    void proposalRequest(() =>
      client.cancel(proposal!.proposalId, proposal!.proposalRevision),
    );
  }

  const profileLines = (ctx: ProposalContext | null) => {
    const before =
      proposal!.reviewReason === "context_changed"
        ? proposal!.previousContext?.profile
        : null;
    return PROFILE_FIELDS.flatMap(([field, label]) => {
      const value = ctx?.profile?.[field];
      if (!value) return [];
      const shown =
        field === "arrivalDate" ? formatDate(value, i18n.language) : value;
      const old = before?.[field];
      const changed = before && old !== value;
      return [
        <li key={field}>
          <span>{t(label, { value: shown })}</span>
          {changed && old && (
            <span className="block text-xs text-ink-muted">
              {t("taskCreate.before", {
                value:
                  field === "arrivalDate"
                    ? formatDate(old, i18n.language)
                    : old,
              })}
            </span>
          )}
        </li>,
      ];
    });
  };
  const lines = profileLines(proposal.context);

  const reviewNote =
    proposal.status === "draft" && proposal.reviewReason
      ? t(
          proposal.reviewReason === "edited"
            ? "taskCreate.reviewEdited"
            : proposal.reviewReason === "context_changed"
              ? "taskCreate.reviewContextChanged"
              : "taskCreate.reviewRestored",
        )
      : null;

  return (
    <section aria-labelledby={`${ids}-title`} className="space-y-5">
      <div>
        <p className="text-xs font-medium text-ink-muted">
          {proposal.status === "draft"
            ? t("taskCreate.draftBadge")
            : t("taskCreate.cardEyebrow")}
        </p>
        <h3
          id={`${ids}-title`}
          tabIndex={-1}
          data-drawer-focus=""
          className="mt-0.5 break-words text-lg font-semibold text-ink-secondary focus-visible:outline-none"
        >
          {savedTitle}
        </h3>
      </div>

      {view.stale && (
        <p className="flex items-start gap-2 rounded-lg bg-surface-card px-3 py-2 text-sm text-ink-tertiary">
          <WifiOff className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
          {t("taskActions.offline")}
        </p>
      )}

      {reviewNote && (
        <p className="rounded-lg border border-primary-subtle bg-primary-bg px-3 py-2 text-sm text-ink-secondary">
          {reviewNote}
        </p>
      )}

      {proposal.status === "draft" && (
        <div>
          <label
            htmlFor={`${ids}-input`}
            className="text-sm font-semibold text-ink-secondary"
          >
            {t("taskCreate.titleLabel")}
          </label>
          <input
            id={`${ids}-input`}
            value={title}
            maxLength={TITLE_MAX + 50}
            onChange={(e) => store?.setDraft(key, e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-border-card bg-surface px-3 py-2 text-base text-ink-secondary placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
          <p className="mt-1 text-xs text-ink-muted">
            {titleValid
              ? t("taskCreate.titleHint")
              : t("taskCreate.titleInvalid", { max: TITLE_MAX })}
          </p>
          <div className="mt-2">
            <Button
              type="button"
              size="sm"
              variant="secondary"
              aria-disabled={!canWrite || !edited || !titleValid}
              className={cn(
                (!canWrite || !edited || !titleValid) &&
                  "cursor-not-allowed opacity-60",
              )}
              onClick={() => void saveTitle()}
            >
              {t("taskCreate.saveTitle")}
            </Button>
          </div>
        </div>
      )}

      <div>
        <p className="text-sm font-semibold text-ink-secondary">
          {t("taskCreate.priorityDoSoon")}
        </p>
        <p className="mt-3 text-sm font-semibold text-ink-secondary">
          {t("taskCreate.basedOn")}
        </p>
        {lines.length ? (
          <ul className="mt-1 space-y-1 text-sm text-ink-tertiary">{lines}</ul>
        ) : (
          <p className="mt-1 text-sm text-ink-tertiary">
            {t("taskCreate.noProfile")}
          </p>
        )}
        {proposal.context?.sameTitleTasks.map((task) => (
          <p
            key={task.taskRef}
            className="mt-2 break-words text-sm text-ink-tertiary"
          >
            {t("taskCreate.sameTitle", { title: task.title })}
          </p>
        ))}
      </div>

      <div aria-live="polite" role="status" className="space-y-3">
        {proposal.status === "cancelled" && (
          <p className="text-sm text-ink-tertiary">{t("taskCreate.closed")}</p>
        )}
        {requestFailed && (
          <p className="text-sm text-destructive-label">
            {t("taskActions.refused")}
          </p>
        )}
        {phase.phase !== "saved" && phase.phase !== "needs_review" && (
          <PhaseMessage
            writable={writable}
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
          />
        )}
      </div>

      {proposal.status === "draft" && (
        <div className="flex flex-wrap gap-2">
          {/* Dark fill as in the reviewed prototype: white on the brand orange is below 4.5:1. */}
          <Button
            type="button"
            aria-label={t("taskCreate.approveA11y", { title: shownTitle })}
            aria-disabled={!canWrite || edited}
            className={cn(
              "bg-ink-secondary hover:bg-ink",
              (!canWrite || edited) && "cursor-not-allowed opacity-60",
            )}
            onClick={approve}
          >
            {t("taskCreate.approve")}
          </Button>
          <Button
            type="button"
            variant="secondary"
            aria-disabled={!canWrite}
            className={cn(!canWrite && "cursor-not-allowed opacity-60")}
            onClick={notNow}
          >
            {t("taskCreate.notNow")}
          </Button>
        </div>
      )}
    </section>
  );
}

function formatDate(value: string, language: string): string {
  const d = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(d.getTime())) return value;
  return new Intl.DateTimeFormat(language, {
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: "UTC",
  }).format(d);
}
