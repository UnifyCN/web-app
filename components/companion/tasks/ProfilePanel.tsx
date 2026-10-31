"use client";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";
import { useProfileEditor } from "@/hooks/useProfileEditor";
import { useTaskActionPhase, type TaskProgressView } from "@/hooks/useTaskActions";
import type { TaskActionStore } from "@/lib/companionActions/taskActionStore";
import type { TaskReceipt } from "@/lib/companionActions/contract";
import type { ProfileField, ProfileProposal } from "@/lib/companionActions/profile";

type Props = { view: TaskProgressView; store: TaskActionStore | null; proposalId?: string | null };
function Action({ label, onClick, disabled = false }: { label: string; onClick: (keyboard: boolean) => void; disabled?: boolean }) {
  return <Button type="button" variant="secondary" size="sm" aria-disabled={disabled}
    className={`min-h-11 whitespace-normal ${disabled ? "cursor-not-allowed opacity-60" : ""}`}
    onClick={event => { if (!disabled) onClick(event.detail === 0); }}>{label}</Button>;
}
export function ProfileReview({ proposal, onApprove, onCancel, disabled }: {
  proposal: ProfileProposal; onApprove: () => void; onCancel: () => void; disabled: boolean;
}) {
  const { t } = useTranslation();
  const value = (s: string | null) => s ?? t("profileActions.notSet");
  const inactive = disabled || proposal.status !== "draft";
  return <section className="ph-no-capture ph-no-record grid gap-3 rounded-xl border border-border-card bg-surface-card p-4" aria-label={t("profileActions.review")}>
    <h3 className="text-sm font-semibold">{t("profileActions.review")}</h3>
    {proposal.reviewReason === "context_changed" || proposal.reviewReason === "restored"
      ? <p role="status" className="text-sm text-ink-secondary">{t("profileActions.changedReview")}</p> : null}
    <p className="break-words text-sm">{t("profileActions.current", { value: value(proposal.context.value) })}</p>
    <p className="break-words text-sm">{t("profileActions.proposed", { value: value(proposal.operation.value) })}</p>
    <div className="flex flex-wrap gap-2"><Action label={t("profileActions.save")} onClick={onApprove} disabled={inactive} />
      <Action label={t("taskCreate.notNow")} onClick={onCancel} disabled={inactive} /></div>
  </section>;
}
export function ProfileRecovery({ storeKey, store, view }: { storeKey: string } & Props) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, storeKey);
  if (phase.phase === "pending" || phase.phase === "lookup_failed" || phase.phase === "not_applied") return <div className="grid gap-2">
    <p role="status" className="text-sm">{t(phase.phase === "pending" ? "taskActions.pending" : phase.phase === "lookup_failed" ? "taskActions.lookupFailed" : "taskActions.notApplied")}</p>
    <Action label={t(phase.phase === "not_applied" ? "taskActions.retry" : "taskActions.checkAgain")}
      disabled={phase.phase === "not_applied" && !view.canWrite}
      onClick={() => void (phase.phase === "not_applied" ? store?.retry(storeKey) : store?.checkAgain(storeKey))} />
  </div>;
  if (["refused", "unavailable", "conflict", "signed_out", "already_undone"].includes(phase.phase)) return <div>
    <p role="status" className="text-sm">{t("profileActions.refresh")}</p>
    <Action label={t("taskActions.checkAgain")} onClick={view.refetch} />
  </div>;
  return null;
}
export function ProfileReceipt({ receipt, storeKey, view, store }: { receipt: TaskReceipt; storeKey: string } & Props) {
  const { t } = useTranslation();
  const phase = useTaskActionPhase(store, storeKey);
  const shown = phase.phase === "saved" ? phase.receipt : receipt;
  if (!shown.profile) return null;
  const p = shown.profile;
  return <div className="ph-no-capture ph-no-record grid gap-3 rounded-xl border border-border-card bg-surface-card p-4">
    <p role="status" className="break-words text-sm">{t("profileActions.saved", { field: t(`profileActions.field.${p.field}`),
      before: p.before ?? t("profileActions.notSet"), after: p.after ?? t("profileActions.notSet") })}</p>
    {shown.kind === "change" && shown.undoable ? <Action label={t("taskActions.undo")} onClick={() => void store?.undo(storeKey, shown.operationId)}
      disabled={!view.canWrite || phase.phase === "saving" || phase.phase === "checking"} /> : null}
    {phase.phase === "profile_review" ? <Reveal open instant><ProfileReview proposal={phase.proposal} disabled={!view.canWrite}
      onApprove={() => void store?.applyOperation(storeKey, phase.proposal.operation, { kind: "approved_proposal",
        proposal_id: phase.proposal.proposalId, proposal_revision: phase.proposal.proposalRevision })}
      onCancel={() => store?.dismiss(storeKey)} /></Reveal> : null}
    <ProfileRecovery storeKey={storeKey} store={store} view={view} />
  </div>;
}
/** Existing overlay drawer content. Buttons retain their DOM identity after a save. */
export function ProfilePanel({ view, store, proposalId = null }: Props) {
  const { t } = useTranslation();
  const editor = useProfileEditor(view, store, proposalId);
  const [instant, setInstant] = useState(false);
  if (!view.profile) return <p role="status" className="loading-delayed text-sm text-ink-muted">{t(view.status === "loading" ? "taskActions.loading" : "taskActions.unavailable")}</p>;
  return <div className="ph-no-capture ph-no-record grid min-w-0 gap-5">
    <p className="text-sm text-ink-secondary">{t("profileActions.explanation")}</p>
    {(["province", "arrival_date"] as ProfileField[]).map(field => <section key={field} className="grid gap-2 border-b border-border-card pb-4">
      <h3 className="text-sm font-semibold">{t(`profileActions.input.${field}`)}</h3>
      <p className="break-words text-sm">{(field === "province" ? view.profile?.province : view.profile?.arrivalDate) ?? t("profileActions.notSet")}</p>
      <div><Action label={t(`profileActions.edit.${field}`)} disabled={Boolean(editor.proposal?.status === "draft") || editor.busy}
        onClick={keyboard => { setInstant(keyboard); editor.edit(field); }} /></div>
    </section>)}
    {editor.editing ? <Reveal open instant={instant}><div className="grid gap-3 rounded-xl border border-border-card bg-surface-card p-4">
      <label className="grid gap-2 text-sm">{t(`profileActions.input.${editor.editing}`)}
        <input aria-label={t(`profileActions.input.${editor.editing}`)} value={editor.text} onChange={event => editor.setText(event.target.value)}
          className="min-h-11 w-full rounded-lg border border-border-card bg-surface px-3 text-ink focus-visible:outline-2 focus-visible:outline-primary" readOnly={editor.busy} />
      </label>
      {editor.editing === "arrival_date" ? <p className="text-sm text-ink-muted">{t("profileActions.dateHint")}</p> : null}
      <div className="flex flex-wrap gap-2"><Action label={t("profileActions.review")} disabled={!view.canWrite || editor.busy || !editor.text.trim()}
        onClick={keyboard => { setInstant(keyboard); void editor.prepare(); }} />
      <Action label={t("taskCreate.notNow")} onClick={editor.clearEditor} disabled={editor.busy} /></div>
    </div></Reveal> : null}
    {editor.proposal ? <Reveal open instant={instant}><ProfileReview proposal={editor.proposal} onApprove={editor.approve}
      onCancel={() => void editor.cancel()} disabled={!editor.canApprove} /></Reveal> : null}
    {editor.receipt ? <ProfileReceipt receipt={editor.receipt} storeKey={editor.key} store={store} view={view} /> : null}
    {editor.waiting ? <p key={editor.loadingKind} role="status" className="loading-delayed text-sm text-ink-muted">{t(`taskActions.${editor.loadingKind}`)}</p> : null}
    {editor.failure || editor.queryFailed ? <p role="alert" className="text-sm text-destructive-label">{t(editor.failure ?? "taskActions.unavailable")}</p> : null}
    <ProfileRecovery storeKey={editor.key} store={store} view={view} />
  </div>;
}
