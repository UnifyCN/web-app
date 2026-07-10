"use client";

import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import type { UserOnboardingProfile } from "@/types";
import { OnboardingFlow } from "./OnboardingFlow";
import { EMPTY_DRAFT, draftFromProfile } from "./types";

const FOCUSABLE_SELECTOR =
  'a[href], button:not([disabled]), input:not([disabled]), ' +
  'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** Visible, focusable descendants of `root`, in DOM order. */
function getFocusable(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return Array.from(
    root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR),
  ).filter((el) => el.offsetParent !== null);
}

interface OnboardingEditModalProps {
  open: boolean;
  onClose: () => void;
  /** Current profile to prefill from; null falls back to a blank flow. */
  profile: UserOnboardingProfile | null;
}

/**
 * Edit-from-profile modal. Reuses the onboarding wizard (minus the welcome
 * step) seeded with the user's current answers; saving runs the same upsert,
 * whose hook invalidates ["current-user"] + ["tasks"] so the profile and
 * checklist update live. Mirrors the CreatePostModal overlay pattern.
 */
export function OnboardingEditModal({
  open,
  onClose,
  profile,
}: OnboardingEditModalProps) {
  const { t } = useTranslation();
  const dialogRef = useRef<HTMLDivElement>(null);

  // Keep a stable reference to onClose so the focus effect below depends only on
  // `open`. Callers pass a fresh inline onClose each render; listing it in the
  // deps would re-run the effect — and its cleanup would steal focus — mid-session.
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Move focus into the dialog on open, trap Tab/Shift+Tab inside it, close on
  // Escape, lock body scroll, and restore focus to the trigger on close.
  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const items = getFocusable(dialog);
      if (items.length === 0) {
        event.preventDefault();
        dialog?.focus();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const active = document.activeElement;

      if (event.shiftKey) {
        if (active === first || active === dialog || !dialog?.contains(active)) {
          event.preventDefault();
          last.focus();
        }
      } else if (active === last || !dialog?.contains(active)) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
      previouslyFocused?.focus();
    };
  }, [open]);

  // `open` only flips true via client interaction (post-hydration), so the
  // portal is never reached during SSR; the typeof guard is belt-and-braces.
  // Portaling to <body> lets the `fixed inset-0` overlay cover the true viewport
  // instead of being clipped to the page's transformed `animate-fade-in` wrapper
  // (a non-`none` transform becomes the containing block for fixed positioning).
  if (!open || typeof document === "undefined") return null;

  return createPortal(
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        ref={dialogRef}
        tabIndex={-1}
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-card bg-surface shadow-lg focus:outline-none"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={t("onboardingWeb.editModalTitle")}
      >
        <div className="flex items-center justify-between border-b border-border-card px-5 py-3">
          <h2 className="text-base font-semibold text-ink-secondary">
            {t("onboardingWeb.editModalTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="cursor-pointer rounded-md p-2 text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </div>

        <div className="flex flex-1 flex-col overflow-hidden p-5 sm:p-6">
          <OnboardingFlow
            mode="edit"
            initialDraft={profile ? draftFromProfile(profile) : EMPTY_DRAFT}
            onComplete={onClose}
            onCancel={onClose}
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}
