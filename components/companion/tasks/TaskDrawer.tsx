"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { ChevronLeft, X } from "lucide-react";
import {
  DialogOverlay,
  DialogPanel,
  DialogPresence,
} from "@/components/ui/Dialog";
import { cn, RTL_FLIP } from "@/lib/utils";

const FOCUSABLE =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

interface TaskDrawerProps {
  open: boolean;
  title: string;
  onClose: () => void;
  /** Shown as a back control when the drawer has a parent view (task list). */
  onBack?: () => void;
  /** Escape and backdrop close only an idle drawer. */
  closeOnEscape?: boolean;
  children: ReactNode;
}

/**
 * Direction B overlay drawer (mobile-app#361): opens at the inline end over the
 * page, keeps app navigation and conversation history in place, and takes the
 * full width on narrow screens. It is a modal dialog: the page behind is inert,
 * Tab stays inside, Escape closes an idle drawer, and focus returns to the
 * control that opened it. When an update removes the focused control (a task
 * opened from the list, a finished recovery step), focus moves to the element
 * marked `data-drawer-focus`, else the drawer heading, so it never falls to the
 * page. Closing never cancels a save; the store keeps it.
 */
export function TaskDrawer({
  open,
  title,
  onClose,
  onBack,
  closeOnEscape = true,
  children,
}: TaskDrawerProps) {
  const { t } = useTranslation();
  const panelRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  // Latest props for the document listeners, which are set up once per opening.
  const escapeRef = useRef(closeOnEscape);
  const closeRef = useRef(onClose);
  useLayoutEffect(() => {
    escapeRef.current = closeOnEscape;
    closeRef.current = onClose;
  });

  useEffect(() => {
    if (!open) return;
    openerRef.current = document.activeElement as HTMLElement | null;
    // Initial focus on the heading, unless focus is already inside the panel
    // (a task opened before this first frame keeps its own focus target).
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      if (panel && panel.contains(document.activeElement)) return;
      headingRef.current?.focus();
    });

    // The page behind the dialog is inert: no focus, no screen-reader reading.
    const inerted: Element[] = [];
    for (const el of Array.from(document.body.children)) {
      if (panelRef.current && el.contains(panelRef.current)) continue;
      if (el.hasAttribute("inert") || el.tagName === "SCRIPT") continue;
      el.setAttribute("inert", "");
      inerted.push(el);
    }
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && escapeRef.current) {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE),
      );
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;
      if (!panelRef.current.contains(active)) {
        event.preventDefault();
        first.focus();
      } else if (
        event.shiftKey &&
        (active === first || active === headingRef.current)
      ) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";

    // Focus rescue: remember the last focused element inside the panel; when an
    // update removes it, move focus to the marked target instead of <body>.
    let lastFocused: HTMLElement | null = null;
    const onFocusIn = (event: FocusEvent) => {
      const panel = panelRef.current;
      if (panel && event.target instanceof HTMLElement && panel.contains(event.target))
        lastFocused = event.target;
    };
    document.addEventListener("focusin", onFocusIn);
    const observer = new MutationObserver(() => {
      const panel = panelRef.current;
      if (!panel || !lastFocused || lastFocused.isConnected) return;
      const active = document.activeElement;
      if (active && active !== document.body && panel.contains(active)) return;
      const target =
        panel.querySelector<HTMLElement>("[data-drawer-focus]") ??
        headingRef.current;
      target?.focus();
    });
    if (panelRef.current)
      observer.observe(panelRef.current, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      for (const el of inerted) el.removeAttribute("inert");
      const opener = openerRef.current;
      if (opener && opener.isConnected) opener.focus();
    };
  }, [open]);

  return (
    <DialogPresence open={open}>
      <DialogOverlay
        className="fixed inset-0 z-50 flex justify-end bg-ink/40"
        role="presentation"
        onClick={() => {
          if (escapeRef.current) onClose();
        }}
      >
        <DialogPanel
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          aria-labelledby="task-drawer-title"
          onClick={(e) => e.stopPropagation()}
          className={cn(
            "flex h-full w-full flex-col bg-surface shadow-xl md:max-w-md",
            "pb-[env(safe-area-inset-bottom)] pt-[env(safe-area-inset-top)]",
          )}
        >
          <div className="flex h-14 shrink-0 items-center gap-1 border-b border-border-card px-2">
            {onBack && (
              <button
                type="button"
                onClick={onBack}
                aria-label={t("taskActions.backToTasks")}
                className="press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              >
                <ChevronLeft className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
              </button>
            )}
            <h2
              id="task-drawer-title"
              ref={headingRef}
              tabIndex={-1}
              className="min-w-0 flex-1 truncate px-2 text-sm font-semibold text-ink-secondary focus-visible:outline-none"
            >
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              aria-label={t("taskActions.close")}
              className="press flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <X className="h-5 w-5" aria-hidden />
            </button>
          </div>
          <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto px-5 py-5">
            {children}
          </div>
        </DialogPanel>
      </DialogOverlay>
    </DialogPresence>
  );
}
