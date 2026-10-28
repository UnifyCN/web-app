"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { cn } from "@/lib/utils";
import {
  DETAIL_TEXT_MAX,
  detailRemoveOperation,
  detailUpdateOperation,
  isDetailProposal,
  verifiedCompensationDetail,
  type DetailProposal,
  type SavedDetail,
  type TaskReceipt,
} from "@/lib/companionActions/contract";
import {
  isUnresolved,
  type TaskActionPhase,
  type TaskActionStore,
} from "@/lib/companionActions/taskActionStore";
import {
  useDetailProposal,
  useTaskActionClient,
  useTaskActionDraft,
  useTaskActionPhase,
  type TaskProgressView,
} from "@/hooks/useTaskActions";

/** Store keys (#370): one saved detail's own changes, and its edit text. */
export const detailKey = (detailId: string) => `detail:${detailId}`;
const editDraftKey = (detailId: string) => `detail-edit:${detailId}`;

type T = (key: string, options?: Record<string, unknown>) => string;

const confirmBox =
  "rounded-lg border border-primary-subtle bg-primary-bg px-3 py-3";
const removeButton = "bg-ink-secondary hover:bg-ink";

function Action({
  label,
  name,
  onClick,
  disabled = false,
  primary = false,
}: {
  label: string;
  name?: string;
  onClick: (keyboard: boolean) => void;
  disabled?: boolean;
  primary?: boolean;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={primary ? undefined : "secondary"}
      aria-label={name}
      aria-disabled={disabled}
      onClick={(event) => {
        if (!disabled) onClick(event.detail === 0);
      }}
      className={cn(
        // 44px targets (sm buttons are 32px tall).
        "min-h-11",
        primary && removeButton,
        disabled && "cursor-not-allowed opacity-60",
      )}
    >
      {label}
    </Button>
  );
}

/** The exact change a detail receipt saved, from its own recorded text (never prose). */
export function detailReceiptText(t: T, receipt: TaskReceipt): string {
  const d = receipt.detail;
  if (!d) return "";
  switch (receipt.operationType) {
    case "detail.update":
      return t("savedDetails.changed", {
        before: d.beforeText ?? "",
        text: d.text,
      });
    case "detail.remove":
      return t("savedDetails.removed", { text: d.text });
    case "detail.restore":
      return t("savedDetails.restored", { text: d.text });
    default:
      return t("savedDetails.saved", { text: d.text });
  }
}

/**
 * One saved-detail receipt with its revision-checked Undo (#370). The receipt is current
 * only while the detail is still at the revision it produced; otherwise it is history and
 * offers no Undo. An Undo that removes the detail (the Undo of a save) asks first; a
 * conflicting Undo changes nothing and offers the reviewed change.
 */
export function DetailReceipt({
  receipt,
  storeKey,
  store,
  view,
}: {
  receipt: TaskReceipt;
  storeKey: string;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const [instant, setInstant] = useState(false);
  const phase = useTaskActionPhase(store, storeKey);
  const shown = phase.phase === "saved" ? phase.receipt : receipt;
  const d = shown.detail;
  if (!d) return null;
  const live = view.details.find((x) => x.detailId === d.detailId);
  // Current while the detail is still exactly as this receipt left it.
  const current =
    shown.current &&
    view.status === "ready" &&
    (d.removed ? !live : live?.revision === shown.afterRevision);
  const canUndo =
    shown.kind === "change" &&
    shown.undoable &&
    current &&
    view.canWrite &&
    !isUnresolved(phase);
  const undoRemoves =
    shown.operationType === "detail.create" ||
    shown.operationType === "detail.restore";
  const undoName =
    shown.operationType === "detail.update"
      ? t("savedDetails.undoChangeA11y", { text: d.text })
      : shown.operationType === "detail.remove"
        ? t("savedDetails.undoRemoveA11y", { text: d.text })
        : t("savedDetails.undoSaveA11y", { text: d.text });
  const undo = (removalConfirmed: boolean) => {
    setConfirming(false);
    void store?.undo(storeKey, shown.operationId, { removalConfirmed });
  };
  return (
    <div className="space-y-2">
      <p className="break-words text-sm text-ink-secondary">
        {detailReceiptText(t, shown)}
      </p>
      {shown.kind === "change" && !current && (
        <p className="text-xs text-ink-muted">{t("savedDetails.historical")}</p>
      )}
      {canUndo && !confirming && (
        <Action
          label={t("taskActions.undo")}
          name={undoName}
          onClick={(keyboard) => {
            setInstant(keyboard);
            if (undoRemoves) setConfirming(true);
            else undo(false);
          }}
        />
      )}
      <Reveal open={confirming} instant={instant} className={confirmBox}>
        <p className="text-sm font-semibold text-ink-secondary">
          {t("savedDetails.confirmTitle")}
        </p>
        <p className="mt-1 break-words text-sm text-ink-tertiary">
          {t("savedDetails.undoSaveConfirm", { text: d.text })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Action
            primary
            label={t("savedDetails.confirmRemove")}
            disabled={!view.canWrite}
            onClick={() => undo(true)}
          />
          <Action
            label={t("savedDetails.cancel")}
            onClick={() => setConfirming(false)}
          />
        </div>
      </Reveal>
      {phase.phase !== "saved" && (
        <DetailPhase
          phase={phase}
          storeKey={storeKey}
          store={store}
          view={view}
        />
      )}
    </div>
  );
}

/** The unresolved or refused state of one detail key; never a false saved result. */
export function DetailPhase({
  phase,
  storeKey,
  store,
  view,
}: {
  phase: TaskActionPhase;
  storeKey: string;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const { t } = useTranslation();
  const [confirming, setConfirming] = useState(false);
  const line = (value: string, error = false) => (
    <p
      key={phase.phase}
      className={cn(
        "text-sm",
        error ? "text-destructive-label" : "text-ink-tertiary",
        (phase.phase === "saving" || phase.phase === "checking") && "loading-delayed",
      )}
    >
      {value}
    </p>
  );
  switch (phase.phase) {
    case "saving":
      return line(t("taskActions.saving"));
    case "checking":
      return line(t("taskActions.checking"));
    case "pending":
    case "lookup_failed":
      return (
        <div className="space-y-2">
          {line(
            phase.phase === "pending"
              ? t("taskActions.pending")
              : t("taskActions.lookupFailed"),
          )}
          <Action
            label={t("taskActions.checkAgain")}
            onClick={() => void store?.checkAgain(storeKey)}
          />
        </div>
      );
    case "not_applied":
      return (
        <div className="space-y-2">
          {line(t("taskActions.notApplied"))}
          <Action
            label={t("taskActions.retry")}
            disabled={!view.canWrite}
            onClick={() => void store?.retry(storeKey)}
          />
        </div>
      );
    case "conflict":
      return line(t("savedDetails.conflict"), true);
    case "detail_exists":
      return line(t("savedDetails.exists"));
    case "already_undone":
      return line(t("taskActions.alreadyUndone"));
    case "refused":
      return line(
        phase.reason === "profile_fact"
          ? t("savedDetails.profileFact")
          : t("taskActions.refused"),
        true,
      );
    case "unavailable":
      return line(t("taskActions.unavailable"), true);
    case "signed_out":
      return line(t("taskActions.signedOut"), true);
    case "undo_review": {
      const op = phase.proposal.operations[0];
      // The receipt keeps its historical text; the reviewed change names the detail as
      // the service read it now, and only while no newer read contradicts it.
      const current = verifiedCompensationDetail(
        op,
        phase.currentDetail,
        view.status === "ready" ? view.details : undefined,
      );
      if (!current) {
        return (
          <div className="space-y-2">
            {line(t("savedDetails.undoConflict"))}
            {line(t("savedDetails.reviewUnverified"), true)}
            <div className="flex flex-wrap gap-2">
              <Action
                label={t("taskActions.keepCurrent")}
                onClick={() => store?.dismiss(storeKey)}
              />
            </div>
          </div>
        );
      }
      const removes = op.type === "detail.remove";
      const label =
        op.type === "detail.update"
          ? t("savedDetails.reviewUpdate", { text: op.text })
          : op.type === "detail.restore"
            ? t("savedDetails.reviewRestore", { text: current.text })
            : t("savedDetails.reviewRemove", { text: current.text });
      return (
        <div className="space-y-2">
          {line(t("savedDetails.undoConflict"))}
          {confirming ? (
            <div className={confirmBox}>
              <p className="text-sm font-semibold text-ink-secondary">
                {t("savedDetails.confirmTitle")}
              </p>
              <p className="mt-1 break-words text-sm text-ink-tertiary">
                {t("savedDetails.confirmBody", { text: current.text })}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Action
                  primary
                  label={t("savedDetails.confirmRemove")}
                  disabled={!view.canWrite}
                  onClick={() => {
                    setConfirming(false);
                    void store?.approveCompensation(storeKey, {
                      removalConfirmed: true,
                    });
                  }}
                />
                <Action
                  label={t("savedDetails.cancel")}
                  onClick={() => setConfirming(false)}
                />
              </div>
            </div>
          ) : (
            <div className="flex flex-wrap gap-2">
              <Action
                label={label}
                disabled={!view.canWrite}
                onClick={() =>
                  removes
                    ? setConfirming(true)
                    : void store?.approveCompensation(storeKey)
                }
              />
              <Action
                label={t("taskActions.keepCurrent")}
                onClick={() => store?.dismiss(storeKey)}
              />
            </div>
          )}
        </div>
      );
    }
    default:
      return null;
  }
}

function DetailRow({
  detail,
  store,
  view,
}: {
  detail: SavedDetail;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const { t } = useTranslation();
  const key = detailKey(detail.detailId);
  const phase = useTaskActionPhase(store, key);
  const edit = useTaskActionDraft(store, editDraftKey(detail.detailId));
  const [confirming, setConfirming] = useState(false);
  const [instant, setInstant] = useState(false);
  const busy = isUnresolved(phase);
  const canWrite = view.canWrite && !busy;
  const editing = edit !== undefined;
  const trimmed = edit?.trim() ?? "";
  const editError = editing && !trimmed ? t("savedDetails.required") : null;
  const canSave =
    canWrite && editing && trimmed.length > 0 && trimmed !== detail.text;

  function save() {
    if (!canSave || !store || edit === undefined) return;
    const submitted = edit;
    void store
      .applyOperation(key, detailUpdateOperation(detail, submitted), {
        kind: "ui_control",
      })
      .then(() => {
        // The typed text is kept unless exactly this text was saved.
        if (
          store.get(key).phase === "saved" &&
          store.draft(editDraftKey(detail.detailId)) === submitted
        )
          store.setDraft(editDraftKey(detail.detailId), undefined);
      });
  }

  function remove() {
    if (!canWrite || !store) return;
    setConfirming(false);
    void store.applyOperation(key, detailRemoveOperation(detail), {
      kind: "ui_control",
      removal_confirmed: true,
    });
  }

  return (
    <li className="space-y-2 py-3" data-testid="saved-detail-row">
      <p className="break-words text-sm font-semibold text-ink-secondary">
        {detail.text}
      </p>
      <p className="text-xs text-ink-muted">
        {detail.source.kind === "approved_proposal"
          ? t("savedDetails.sourceApproved")
          : t("savedDetails.sourceCommand")}
      </p>
      {!editing && !confirming && (
        <div className="flex flex-wrap gap-2">
          <Action
            label={t("savedDetails.edit")}
            name={t("savedDetails.editA11y", { text: detail.text })}
            disabled={!canWrite}
            onClick={(keyboard) => {
              setInstant(keyboard);
              store?.setDraft(editDraftKey(detail.detailId), detail.text);
            }}
          />
          <Action
            label={t("savedDetails.remove")}
            name={t("savedDetails.removeA11y", { text: detail.text })}
            disabled={!canWrite}
            onClick={(keyboard) => {
              setInstant(keyboard);
              setConfirming(true);
            }}
          />
        </div>
      )}
      <Reveal open={editing} instant={instant} className="space-y-2">
        <textarea
          aria-label={t("savedDetails.editLabel")}
          value={edit ?? ""}
          maxLength={DETAIL_TEXT_MAX}
          rows={2}
          onChange={(e) =>
            store?.setDraft(editDraftKey(detail.detailId), e.target.value)
          }
          className="min-h-11 w-full rounded-lg border border-border-card bg-surface px-3 py-2 text-base text-ink-secondary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        />
        {editError && (
          <p className="text-sm text-destructive-label">{editError}</p>
        )}
        <div className="flex flex-wrap gap-2">
          <Action
            primary
            label={t("savedDetails.save")}
            disabled={!canSave}
            onClick={save}
          />
          <Action
            label={t("savedDetails.cancel")}
            onClick={() =>
              store?.setDraft(editDraftKey(detail.detailId), undefined)
            }
          />
        </div>
      </Reveal>
      <Reveal open={confirming} instant={instant} className={confirmBox}>
        <p className="text-sm font-semibold text-ink-secondary">
          {t("savedDetails.confirmTitle")}
        </p>
        <p className="mt-1 break-words text-sm text-ink-tertiary">
          {t("savedDetails.confirmBody", { text: detail.text })}
        </p>
        <div className="mt-3 flex flex-wrap gap-2">
          <Action
            primary
            label={t("savedDetails.confirmRemove")}
            disabled={!canWrite}
            onClick={remove}
          />
          <Action
            label={t("savedDetails.cancel")}
            onClick={() => setConfirming(false)}
          />
        </div>
      </Reveal>
      <div aria-live="polite" role="status" className="space-y-2">
        {phase.phase === "saved" ? (
          <DetailReceipt
            receipt={phase.receipt}
            storeKey={key}
            store={store}
            view={view}
          />
        ) : (
          <DetailPhase phase={phase} storeKey={key} store={store} view={view} />
        )}
      </div>
    </li>
  );
}

/** A detail removed in this session: its removal receipt stays, with its Undo. */
function RemovedDetail({
  storeKey,
  store,
  view,
}: {
  storeKey: string;
  store: TaskActionStore | null;
  view: TaskProgressView;
}) {
  const phase = useTaskActionPhase(store, storeKey);
  return (
    <li aria-live="polite" role="status" className="space-y-2 py-3">
      {phase.phase === "saved" ? (
        <DetailReceipt
          receipt={phase.receipt}
          storeKey={storeKey}
          store={store}
          view={view}
        />
      ) : (
        <DetailPhase
          phase={phase}
          storeKey={storeKey}
          store={store}
          view={view}
        />
      )}
    </li>
  );
}

/**
 * The account's saved personal details (mobile-app#370), in the Companion drawer: view,
 * edit at the revision shown, and remove after confirmation. Each control authorizes
 * exactly its own change and gets a receipt with a revision-checked Undo. Typed edits live
 * in the account's action store, so closing and reopening the drawer keeps them.
 */
export function SavedDetailsPanel({
  view,
  store,
}: {
  view: TaskProgressView;
  store: TaskActionStore | null;
}) {
  const { t } = useTranslation();
  const live = new Set(view.details.map((d) => detailKey(d.detailId)));
  const removedKeys = (store?.keysWith("detail:") ?? []).filter(
    (key) => !live.has(key),
  );
  return (
    <div className="space-y-3">
      <p className="text-sm text-ink-tertiary">{t("savedDetails.intro")}</p>
      {view.stale && (
        <p className="text-sm text-ink-muted">{t("taskActions.offline")}</p>
      )}
      {view.details.length === 0 && removedKeys.length === 0 && (
        <p className="text-sm text-ink-muted">{t("savedDetails.empty")}</p>
      )}
      <ul
        className="divide-y divide-border-card"
        aria-label={t("savedDetails.title")}
      >
        {view.details.map((detail) => (
          <DetailRow
            key={detail.detailId}
            detail={detail}
            store={store}
            view={view}
          />
        ))}
        {removedKeys.map((key) => (
          <RemovedDetail key={key} storeKey={key} store={store} view={view} />
        ))}
      </ul>
    </div>
  );
}

/**
 * Review of one detail the answer suggested (mobile-app#370). It is not saved until the
 * user approves this revision; Not now cancels the draft and saves nothing.
 */
export function DetailProposalPanel({
  proposalId,
  view,
  store,
  onViewDetails,
}: {
  proposalId: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
  onViewDetails: () => void;
}) {
  const { t } = useTranslation();
  const query = useDetailProposal(proposalId);
  const bound = useTaskActionClient();
  const key = `proposal:${proposalId}`;
  const phase = useTaskActionPhase(store, key);
  const [cancelling, setCancelling] = useState(false);
  const proposal: DetailProposal | undefined =
    phase.phase === "needs_review" &&
    isDetailProposal(phase.proposal) &&
    phase.proposal.proposalRevision >= (query.data?.proposalRevision ?? 0)
      ? phase.proposal
      : query.data;

  if (!proposal) {
    return (
      <p role="status" className="loading-delayed text-sm text-ink-muted">
        {query.isError
          ? t("taskActions.unavailable")
          : t("taskActions.loading")}
      </p>
    );
  }
  const text = proposal.operation.text;
  const saved = phase.phase === "saved" ? phase.receipt : proposal.receipt;
  const busy = isUnresolved(phase) || cancelling;
  const canApprove =
    view.canWrite &&
    proposal.status === "draft" &&
    proposal.sameTextDetails.length === 0 &&
    !busy;

  function approve() {
    if (!canApprove || !store || !proposal) return;
    void store.applyOperation(key, proposal.operation, {
      kind: "approved_proposal",
      proposal_id: proposal.proposalId,
      proposal_revision: proposal.proposalRevision,
    });
  }

  async function notNow() {
    if (!bound || !proposal || busy) return;
    setCancelling(true);
    try {
      await bound.client.cancelDetail(
        proposal.proposalId,
        proposal.proposalRevision,
      );
    } finally {
      setCancelling(false);
      void query.refetch();
    }
  }

  return (
    <div className="space-y-3">
      {/* The drawer title names the question ("Remember this detail?"). */}
      <p className="text-xs text-ink-muted">{t("savedDetails.draftEyebrow")}</p>
      <p className="break-words text-sm font-semibold text-ink-secondary">
        {text}
      </p>
      <div aria-live="polite" role="status" className="space-y-2">
        {saved ? (
          <DetailReceipt
            receipt={saved}
            storeKey={key}
            store={store}
            view={view}
          />
        ) : proposal.status === "cancelled" ? (
          <p className="text-sm text-ink-tertiary">
            {t("savedDetails.notSaved")}
          </p>
        ) : (
          <DetailPhase phase={phase} storeKey={key} store={store} view={view} />
        )}
      </div>
      {saved ? (
        <Action label={t("savedDetails.view")} onClick={onViewDetails} />
      ) : proposal.status === "draft" ? (
        <>
          <p className="text-sm text-ink-tertiary">
            {t("savedDetails.reviewBody")}
          </p>
          {proposal.sameTextDetails.length > 0 && (
            <p className="text-sm text-ink-tertiary">
              {t("savedDetails.draftChanged")}
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Action
              primary
              label={t("savedDetails.rememberThis")}
              disabled={!canApprove}
              onClick={approve}
            />
            <Action
              label={t("savedDetails.notNow")}
              disabled={busy}
              onClick={() => void notNow()}
            />
          </div>
        </>
      ) : null}
    </div>
  );
}
