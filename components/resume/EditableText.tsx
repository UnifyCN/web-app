"use client";

import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

/**
 * Inline-editable text node for the resume builder — a `contentEditable` span
 * that commits on blur. There's no house primitive for click-into-rendered-text
 * editing, so this is purpose-built and kept deliberately small.
 *
 * Why contentEditable (not an input): it preserves the exact resume layout
 * (bold title left / italic dates right on one row) with no input auto-sizing.
 *
 * Cursor-safety: the DOM text is set imperatively (via ref) on mount and re-synced
 * ONLY when `value` changes while the field is NOT focused — so an AI turn's new
 * values refresh the fields, but React never overwrites text the user is typing.
 * No per-keystroke state, so there are no contentEditable/React cursor fights.
 *
 * When `editable` is false it renders a plain, non-editable span (so callers can
 * use the same component for the read-only / print copy).
 */
export function EditableText({
  value,
  editable,
  onCommit,
  className,
  placeholder,
  block = false,
  ariaLabel,
}: {
  value: string;
  editable: boolean;
  onCommit: (value: string) => void;
  className?: string;
  placeholder?: string;
  /** Block-level (wrapping paragraph, e.g. the summary) vs inline. */
  block?: boolean;
  ariaLabel?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || document.activeElement === el) return;
    if (el.textContent !== value) el.textContent = value;
  }, [value]);

  if (!editable) {
    return <span className={className}>{value}</span>;
  }

  return (
    <span
      ref={ref}
      role="textbox"
      aria-label={ariaLabel ?? placeholder}
      contentEditable
      suppressContentEditableWarning
      spellCheck={false}
      data-placeholder={placeholder}
      onBlur={(e) => {
        const el = e.currentTarget;
        const text = (el.textContent ?? "").replace(/ /g, " ").trim();
        // contentEditable can leave a stray <br>/<div> behind; clear it when the
        // field is empty so the `:empty` placeholder shows.
        if (text === "" && el.innerHTML !== "") el.innerHTML = "";
        if (text !== value) onCommit(text);
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          e.currentTarget.textContent = value; // discard the uncommitted edit
          e.currentTarget.blur();
        }
      }}
      onPaste={(e) => {
        // Plain text only — strip any pasted formatting.
        e.preventDefault();
        const text = e.clipboardData.getData("text/plain").replace(/\s*\n\s*/g, " ");
        e.currentTarget.ownerDocument.execCommand("insertText", false, text);
      }}
      className={cn(
        "resume-editable rounded-[3px] outline-none",
        block ? "inline-block w-full" : "inline-block",
        className,
      )}
    />
  );
}
