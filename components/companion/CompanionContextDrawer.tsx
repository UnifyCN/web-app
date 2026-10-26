"use client";

import { useEffect, useId, useRef, type Ref } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, ExternalLink, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { DialogOverlay, DialogPanel, DialogPresence } from "@/components/ui/Dialog";
import type { CompanionContext, ContextItem } from "@/lib/companionContext";
import { ContextNotice } from "./ContextSummary";
import { useContextLabels } from "./contextLabels";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

/**
 * "Sources and context" drawer (direction B, ticket #362): an inline-end
 * overlay panel over the conversation (right in LTR, left in RTL; full width on
 * narrow screens). Lists the official pages an answer checked, with publisher,
 * URL and actual check time, and the account context it read. Escape and the
 * backdrop close it, Tab stays inside, and focus returns to the control that
 * opened it. The conversation and the composer draft stay mounted beneath.
 *
 * Enter/exit motion, reduced motion and the inert background come from the
 * shared dialog pieces (components/ui/Dialog.tsx). Focus and keys are keyed on `open` only, so a
 * parent update never moves focus, and they never wait for the exit fade.
 */
export function CompanionContextDrawer({
  context,
  onClose,
}: {
  /** The answer's context; null when closed. */
  context: CompanionContext | null;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = context !== null;
  // The latest onClose without re-running the open effect: parents pass a new
  // function on every render.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    const trigger = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const focusable = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // Back to the "Sources and context" button that opened the drawer.
      if (trigger && document.contains(trigger)) trigger.focus();
    };
  }, [open]);

  return (
    <DialogPresence open={open} inertBackground>
      {context && (
        <div key="companion-context-drawer" className="fixed inset-0 z-50">
          <DialogOverlay
            aria-hidden
            onClick={() => onCloseRef.current()}
            className="absolute inset-0 bg-black/30"
          />
          <CompanionContextPanel
            context={context}
            onClose={() => onCloseRef.current()}
            panelRef={panelRef}
            closeRef={closeRef}
          />
        </div>
      )}
    </DialogPresence>
  );
}

/** The drawer panel itself: header, notices, pages, profile, conversation, tasks. */
export function CompanionContextPanel({
  context,
  onClose,
  panelRef,
  closeRef,
}: {
  context: CompanionContext;
  onClose: () => void;
  panelRef?: Ref<HTMLDivElement>;
  closeRef?: Ref<HTMLButtonElement>;
}) {
  const { t } = useTranslation();
  const labels = useContextLabels();
  const titleId = useId();

  const pages = context.guidance.sources;
  const profile = context.items.find((i) => i.kind === "profile");
  const stated = context.items.find((i) => i.kind === "conversation_detail");
  const tasks = context.items.filter(
    (i): i is Extract<ContextItem, { kind: "checklist_task" }> =>
      i.kind === "checklist_task",
  );

  return (
    <DialogPanel
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="absolute inset-y-0 end-0 flex w-full flex-col bg-surface shadow-xl ltr:origin-right rtl:origin-left sm:w-[420px] sm:max-w-[92vw] sm:border-s sm:border-border-card"
    >
      <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-card px-4">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-sm font-bold text-ink-secondary">
          {t("companion.context.drawerTitle")}
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label={t("companion.context.closeAria")}
          className="-me-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-primary"
        >
          <X className="h-5 w-5" aria-hidden />
        </button>
      </header>

      <div className="scrollbar-thin min-h-0 flex-1 space-y-6 overflow-y-auto px-4 py-4">
        <ContextNotice context={context} />

        <section aria-labelledby={`${titleId}-pages`}>
          <h3 id={`${titleId}-pages`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
            {t("companion.context.sectionPages")}
          </h3>
          {pages.length === 0 ? (
            <p className="text-sm text-ink-muted">{t("companion.context.noPages")}</p>
          ) : (
            <ul className="space-y-2">
              {pages.map((page) => (
                <li key={`${page.id}-${page.url}`} className="rounded-lg bg-surface-gray px-3 py-2.5">
                  <a
                    href={page.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group flex items-start gap-2 text-sm font-medium text-context-link hover:underline"
                  >
                    <span dir="auto" className="min-w-0 flex-1 break-words">
                      {page.title ?? page.url}
                    </span>
                    <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
                    <span className="sr-only">{t("companion.context.opensNewTab")}</span>
                  </a>
                  <p className="mt-1 text-xs text-ink-secondary">{page.publisher}</p>
                  <p dir="ltr" className="mt-0.5 break-all text-start text-xs text-ink-muted">
                    {page.url}
                  </p>
                  <p
                    className={cn(
                      "mt-1 flex items-center gap-1 text-xs",
                      page.status === "checked" ? "text-ink-muted" : "text-ink-secondary",
                    )}
                  >
                    {page.status !== "checked" && <AlertCircle className="h-3.5 w-3.5 shrink-0" aria-hidden />}
                    {page.status === "checked" && page.checkedAt
                      ? t("companion.context.pageChecked", { time: labels.time(page.checkedAt) })
                      : page.status === "excluded"
                        ? t("companion.context.pageExcluded", { province: page.jurisdiction })
                        : t("companion.context.pageFailed")}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>

        {(profile || context.unreadable.includes("profile")) && (
          <section aria-labelledby={`${titleId}-profile`}>
            <h3 id={`${titleId}-profile`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("companion.context.sectionAccount")}
            </h3>
            {profile?.kind === "profile" ? (
              <dl className="space-y-1 text-sm">
                {profile.fields.map((field) => (
                  <div key={field.key} className="flex flex-wrap gap-x-2">
                    <dt className="text-ink-muted">{t(`companion.context.field.${field.key}`)}</dt>
                    <dd dir="auto" className="text-ink-secondary">{labels.fieldValue(field.key, field.value)}</dd>
                  </div>
                ))}
              </dl>
            ) : (
              <p className="text-sm text-ink-muted">{t("companion.context.profileUnreadable")}</p>
            )}
          </section>
        )}

        {stated?.kind === "conversation_detail" && (
          <section aria-labelledby={`${titleId}-stated`}>
            <h3 id={`${titleId}-stated`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("companion.context.sectionConversation")}
            </h3>
            <dl className="space-y-1 text-sm">
              {stated.fields.map((field) => (
                <div key={field.key} className="flex flex-wrap gap-x-2">
                  <dt className="text-ink-muted">{t(`companion.context.field.${field.key}`)}</dt>
                  <dd dir="auto" className="text-ink-secondary">{labels.fieldValue(field.key, field.value)}</dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        {(tasks.length > 0 || context.unreadable.includes("checklist")) && (
          <section aria-labelledby={`${titleId}-tasks`}>
            <h3 id={`${titleId}-tasks`} className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
              {t("companion.context.sectionTasks")}
            </h3>
            {tasks.length > 0 ? (
              <ul className="space-y-1.5 text-sm">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-baseline justify-between gap-x-3">
                    <span dir="auto" className="min-w-0 break-words text-ink-secondary">
                      {task.title ?? t("companion.context.untitledTask")}
                    </span>
                    <span className="shrink-0 text-xs text-ink-muted">
                      {t(`companion.context.taskState.${task.state}`)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-ink-muted">{t("companion.context.checklistUnreadable")}</p>
            )}
          </section>
        )}

        <p className="border-t border-border-card pt-3 text-xs text-ink-muted">
          {t("companion.context.readOnlyNote")}
        </p>
      </div>
    </DialogPanel>
  );
}
