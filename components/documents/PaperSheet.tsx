"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/** Serif stack shared by the resume + cover-letter paper (and their section
 *  headings). Exported so the per-feature inner renders can reference it. */
export const SERIF = "Georgia, 'Times New Roman', 'Nimbus Roman', serif";

/**
 * Thin outer "paper" wrapper shared by ResumePaper + CoverLetterPaper. It owns
 * the surface chrome (centered max-width page, white fill, ring/shadow), the
 * serif font, and the editable/disabled state classes. The inner read-only vs
 * editable render stays per-feature and is passed as `children`.
 *
 * Feature-specific bits are injected:
 *  - `paperClassName` — the print-CSS hook ("resume-paper" | "cover-letter-paper");
 *    the editable-variant class ("<paperClassName>-editable") is derived from it.
 *  - `className` — the feature page padding ("px-[52px] py-[44px]" vs
 *    "px-[64px] py-[56px]").
 *
 * `isEditable` is computed exactly as the feature does (`editable && !!onChange`)
 * so the wrapper classes match the inner render's mode.
 */
export function PaperSheet({
  paperClassName,
  className,
  editable = false,
  disabled = false,
  onChange,
  children,
}: {
  /** Print-CSS hook + base for the derived `-editable` class. */
  paperClassName: string;
  /** Feature page padding. */
  className: string;
  editable?: boolean;
  /** Temporarily block edits (e.g. while an AI turn is in flight) without
   *  flipping the editable layout back to the read-only one. */
  disabled?: boolean;
  /** Only its presence is read (to compute `isEditable`); the feature owns it. */
  onChange?: unknown;
  children: ReactNode;
}) {
  const isEditable = editable && !!onChange;
  return (
    <div
      className={cn(
        paperClassName,
        "mx-auto w-full max-w-[816px] bg-white",
        className,
        "text-black shadow-sm ring-1 ring-black/5",
        isEditable && `${paperClassName}-editable`,
        // While an AI turn runs, keep the editable layout but block interaction
        // so a concurrent manual edit can't race the turn's full-doc overwrite.
        isEditable && disabled && "pointer-events-none",
      )}
      style={{ fontFamily: SERIF }}
    >
      {children}
    </div>
  );
}
