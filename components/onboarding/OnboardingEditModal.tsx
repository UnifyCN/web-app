"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import type { UserOnboardingProfile } from "@/types";
import { OnboardingFlow } from "./OnboardingFlow";
import { EMPTY_DRAFT, draftFromProfile } from "./types";

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
  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[88vh] w-full max-w-lg flex-col overflow-hidden rounded-card bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Edit your profile"
      >
        <div className="flex items-center justify-between border-b border-border-card px-5 py-3">
          <h2 className="text-base font-semibold text-ink-secondary">
            Edit your profile
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="cursor-pointer rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
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
    </div>
  );
}
