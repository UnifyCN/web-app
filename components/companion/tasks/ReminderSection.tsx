"use client";
import { useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import type { TaskProgressView } from "@/hooks/useTaskActions";
import { useReminderEditor } from "@/hooks/useReminderEditor";
import type { TaskActionStore } from "@/lib/companionActions/taskActionStore";
import { reminderLabel } from "@/lib/companionActions/reminders";
import { Button } from "@/components/ui/Button";
import { Reveal } from "@/components/ui/Reveal";

export function ReminderSection({
  taskRef,
  view,
  store,
}: {
  taskRef: string;
  view: TaskProgressView;
  store: TaskActionStore | null;
}) {
  const { t, i18n } = useTranslation();
  const e = useReminderEditor(taskRef, view, store);
  const [reviewInstant, setReviewInstant] = useState(false);
  const [undoInstant, setUndoInstant] = useState(false);
  const button = (label: string, onClick: (keyboard: boolean) => void, disabled = false) => (
    <Button
      type="button"
      variant="secondary"
      className="min-h-11 h-auto whitespace-normal text-start"
      disabled={disabled}
      onClick={(event) => onClick(event.detail === 0)}
    >
      {label}
    </Button>
  );
  const reviewButton = useRef<HTMLButtonElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const op = e.proposal?.operation;
  const receipt = e.phase.phase === "saved" ? e.phase.receipt : null;
  return (
    <section
      aria-label={t("reminders.title")}
      className="mt-6 space-y-3 border-t border-border-card pt-5"
    >
      <h3
        ref={headingRef}
        tabIndex={-1}
        className="font-semibold text-ink-secondary"
      >
        {t("reminders.title")}
      </h3>
      <ReminderList view={view} taskRef={taskRef} />
      <label className="block space-y-1 text-sm">
        {t("reminders.instant")}
        <input
          className="block min-h-11 w-full rounded-xl border border-border-card px-3"
          value={e.draft.instant}
          onChange={(v) => e.change("instant", v.target.value)}
          placeholder="2027-11-07T01:30-04:00"
          autoComplete="off"
        />
      </label>
      <label className="block space-y-1 text-sm">
        {t("reminders.zone")}
        <input
          className="block min-h-11 w-full rounded-xl border border-border-card px-3"
          value={e.draft.zone}
          onChange={(v) => e.change("zone", v.target.value)}
          autoComplete="off"
        />
      </label>
      <p className="text-sm text-ink-muted">{t("reminders.timeHelp")}</p>
      {e.error ? (
        <p role="alert">
          {t(
            e.error === "time"
              ? "reminders.invalidTime"
              : "reminders.readFailed",
          )}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-2">
        <Button
          ref={reviewButton}
          type="button"
          variant="secondary"
          className="min-h-11 h-auto whitespace-normal text-start"
          onClick={(event) => {
            setReviewInstant(event.detail === 0);
            void e.prepare();
          }}
          disabled={!e.canSchedule}
        >
          {t("reminders.review")}
        </Button>
        {e.active
          ? button(t("reminders.cancel"), (keyboard) => {
              setReviewInstant(keyboard);
              void e.cancel();
            }, !e.canWrite)
          : null}
      </div>
      <Reveal open={Boolean(op)} instant={reviewInstant}>
        {op ? (
          <div
            aria-live="polite"
            className="space-y-3 rounded-xl bg-surface-card p-3"
          >
            <p>
              {op.type === "reminder.schedule"
                ? reminderLabel(
                    { remindAt: op.remind_at, timeZone: op.time_zone },
                    i18n.language,
                  )
                : t("reminders.cancelConfirm")}
            </p>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 h-auto whitespace-normal text-start"
              disabled={!e.canWrite}
              onClick={() => {
                e.save();
                if (e.isOwned()) headingRef.current?.focus();
              }}
            >
              {t(
                e.confirm === "cancel"
                  ? "reminders.confirmCancel"
                  : op.type === "reminder.cancel"
                    ? "reminders.cancel"
                    : "reminders.save",
              )}
            </Button>
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 h-auto whitespace-normal text-start"
              onClick={() => {
                e.clearReview();
                if (e.isOwned()) reviewButton.current?.focus();
              }}
            >
              {t("reminders.keepEditing")}
            </Button>
          </div>
        ) : null}
      </Reveal>
      {receipt ? (
        <div role="status" className="space-y-2">
          <p>
            {t(
              receipt.reminder?.stopped
                ? "reminders.stopped"
                : "reminders.saved",
            )}
          </p>
          {receipt.reminder?.remindAt && receipt.reminder.timeZone ? (
            <p>
              {reminderLabel(
                {
                  remindAt: receipt.reminder.remindAt,
                  timeZone: receipt.reminder.timeZone,
                },
                i18n.language,
              )}
            </p>
          ) : null}
          {receipt.reminder &&
          (!receipt.current ||
            view.reminders?.items.some(
              (r) =>
                r.reminderId === receipt.reminder!.reminderId &&
                r.status !== "pending",
            )) ? (
            <p>{t("reminders.history")}</p>
          ) : null}
          <p className="text-sm text-ink-muted">{t("reminders.undoHelp")}</p>
          {receipt.undoable
            ? button(
                t("taskActions.undo"),
                (keyboard) => {
                  setUndoInstant(keyboard);
                  e.setConfirm("undo");
                },
                !e.canWrite,
              )
            : null}
        </div>
      ) : null}
      <Reveal open={e.confirm === "undo"} instant={undoInstant}>
        {e.confirm === "undo" ? (
          <div>
            <p>{t("reminders.undoConfirm")}</p>
            {button(t("reminders.confirmUndo"), e.undo, !e.canWrite)}
            {button(t("reminders.keep"), () => e.setConfirm(null))}
          </div>
        ) : null}
      </Reveal>
      {[
        "saving",
        "checking",
        "pending",
        "lookup_failed",
        "not_applied",
      ].includes(e.phase.phase) ? (
        <div
          key={e.phase.phase}
          role="status"
          className={e.phase.phase === "saving" || e.phase.phase === "checking" ? "loading-delayed" : undefined}
        >
          <p>
            {t(
              `taskActions.${e.phase.phase === "saving" ? "saving" : e.phase.phase === "checking" ? "checking" : e.phase.phase === "lookup_failed" ? "lookupFailed" : e.phase.phase === "not_applied" ? "notApplied" : "pending"}`,
            )}
          </p>
          {e.phase.phase === "pending" || e.phase.phase === "lookup_failed"
            ? button(t("taskActions.checkAgain"), e.lookup, !view.canWrite)
            : null}
          {e.phase.phase === "not_applied"
            ? button(t("taskActions.retry"), e.retry, !view.canWrite)
            : null}
        </div>
      ) : null}
      {["conflict", "refused", "unavailable"].includes(e.phase.phase) ? (
        <p role="alert">{t("reminders.reviewAgain")}</p>
      ) : null}
    </section>
  );
}
export function ReminderList({
  view,
  taskRef,
  onOpen,
}: {
  view: TaskProgressView;
  taskRef?: string;
  onOpen?: (ref: string, title: string) => void;
}) {
  const { t, i18n } = useTranslation();
  if (!view.reminders) return null;
  const items = view.reminders.items.filter(
    (r) => !taskRef || r.taskRef === taskRef,
  );
  return (
    <div className="space-y-3">
      {view.stale ? <p role="status">{t("reminders.readFailed")}</p> : null}
      {view.reminders.scheduler !== "ready" &&
      items.some((r) => r.status === "pending") ? (
        <p className="text-sm text-ink-muted">
          {t("reminders.schedulerUnavailable")}
        </p>
      ) : null}
      {items.map((r) => (
        <div key={r.reminderId} className="space-y-1 py-2">
          <p className="font-medium">
            {r.title ?? t("taskActions.existingTask")}
          </p>
          <p className="text-sm">{reminderLabel(r, i18n.language)}</p>
          <p className="text-sm text-ink-muted">
            {t(
              r.status !== "pending"
                ? "reminders.stopped"
                : r.due && !view.stale
                  ? "reminders.due"
                  : "reminders.scheduled",
            )}
          </p>
          {r.cancelledReason === "schema_rollback" ||
          r.cancelledReason === "service_interruption" ? (
            <p>{t("reminders.interruption")}</p>
          ) : null}
          {onOpen && !view.stale && r.status === "pending" ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11"
              onClick={() => {
                if (!view.stale)
                  onOpen(r.taskRef, r.title ?? t("taskActions.existingTask"));
              }}
            >
              {t("reminders.openTask")}
            </Button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
