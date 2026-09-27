"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { ImageOff, ImagePlus, RefreshCw, Trash2, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/auth/FormError";
import {
  COVER_ACCEPT,
  formatFileSize,
  validateCoverFile,
} from "@/lib/admin/eventCover";
import { cn } from "@/lib/utils";

/*
 * The optional cover photo on the team-event form (#147). Picking a file only checks
 * it and shows a preview; nothing uploads until Save (services/adminEvents.ts), so an
 * abandoned form leaves no object in the bucket.
 */

/** The cover part of the form. A `replace` carries the preview's object URL. */
export type CoverDraft =
  | { kind: "keep" }
  | { kind: "replace"; file: File; previewUrl: string }
  | { kind: "remove" };

export const KEEP_COVER_DRAFT: CoverDraft = { kind: "keep" };

const HINT = "JPEG, PNG, or WebP, up to 5 MB. It shows at 16:9 (for example 1600 × 900).";

export function CoverPhotoField({
  initialUrl,
  draft,
  onChange,
  disabled,
}: {
  /** `cover_photo_url` as stored (null on the add page, or when there is none). */
  initialUrl: string | null;
  draft: CoverDraft;
  onChange: (next: CoverDraft) => void;
  disabled?: boolean;
}) {
  const inputId = useId();
  const hintId = `${inputId}-hint`;
  const errorId = `${inputId}-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [pickError, setPickError] = useState<string | null>(null);
  const [dragging, setDragging] = useState(false);
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);

  // The latest draft, so unmount can release its object URL. Written only in
  // event handlers (never during render).
  const latest = useRef<CoverDraft>(draft);
  useEffect(
    () => () => {
      if (latest.current.kind === "replace") {
        URL.revokeObjectURL(latest.current.previewUrl);
      }
    },
    [],
  );

  function change(next: CoverDraft) {
    const previous = latest.current;
    if (previous.kind === "replace" && previous !== next) {
      URL.revokeObjectURL(previous.previewUrl);
    }
    latest.current = next;
    onChange(next);
  }

  function pick(file: File | undefined) {
    if (!file || disabled) return;
    const check = validateCoverFile(file);
    if (!check.ok) {
      // Keep whatever was chosen before; only explain why this file was refused.
      setPickError(check.message);
      return;
    }
    setPickError(null);
    change({ kind: "replace", file, previewUrl: URL.createObjectURL(file) });
  }

  function remove() {
    setPickError(null);
    // With no stored cover, "remove" and "keep" both mean no cover; keep sends nothing.
    change(initialUrl ? { kind: "remove" } : KEEP_COVER_DRAFT);
  }

  const shownUrl =
    draft.kind === "replace"
      ? draft.previewUrl
      : draft.kind === "keep"
        ? initialUrl
        : null;
  const broken = shownUrl !== null && brokenUrl === shownUrl;
  const describedBy = pickError ? `${errorId} ${hintId}` : hintId;

  const fileInput = (
    <input
      ref={inputRef}
      id={inputId}
      type="file"
      accept={COVER_ACCEPT}
      className="sr-only"
      disabled={disabled}
      // With a photo shown, the Replace button opens the picker; keep a single tab stop.
      tabIndex={shownUrl ? -1 : undefined}
      aria-label={shownUrl ? "Replace cover photo" : undefined}
      aria-describedby={describedBy}
      aria-invalid={pickError ? true : undefined}
      onChange={(event) => {
        pick(event.target.files?.[0]);
        // Allow picking the same file again after a remove.
        event.target.value = "";
      }}
    />
  );

  return (
    <div>
      {shownUrl ? (
        <div>
          <div className="relative aspect-[16/9] w-full overflow-hidden rounded-xl border border-border-card bg-surface-gray">
            {broken ? (
              <div className="flex h-full flex-col items-center justify-center gap-2 px-4 text-center">
                <ImageOff className="h-6 w-6 text-ink-inactive" aria-hidden />
                <p className="text-xs text-ink-muted">
                  Could not load this photo. Replace it or remove it.
                </p>
              </div>
            ) : (
              <Image
                // blob: previews and any stored host: no optimisation needed here.
                unoptimized
                src={shownUrl}
                alt={
                  draft.kind === "replace"
                    ? "Preview of the new cover photo"
                    : "Current cover photo"
                }
                fill
                sizes="(max-width: 720px) 100vw, 680px"
                className="animate-fade-in object-cover"
                onError={() => setBrokenUrl(shownUrl)}
              />
            )}
          </div>

          <div className="mt-3 flex flex-col gap-3 min-[420px]:flex-row min-[420px]:items-center">
            <p className="min-w-0 flex-1 text-xs text-ink-muted" aria-live="polite">
              {draft.kind === "replace" ? (
                <>
                  <span className="block truncate font-medium text-ink-secondary">
                    {draft.file.name}
                  </span>
                  {formatFileSize(draft.file.size)} · uploads when you save
                </>
              ) : (
                "Current cover photo"
              )}
            </p>
            <div className="flex gap-2">
              {fileInput}
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1 min-[420px]:flex-none"
                leftIcon={<RefreshCw className="h-3.5 w-3.5" aria-hidden />}
                onClick={() => inputRef.current?.click()}
                disabled={disabled}
                aria-describedby={describedBy}
              >
                Replace
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                className="flex-1 text-destructive hover:bg-destructive/5 min-[420px]:flex-none"
                leftIcon={<Trash2 className="h-3.5 w-3.5" aria-hidden />}
                onClick={remove}
                disabled={disabled}
              >
                Remove
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <label
            htmlFor={inputId}
            onDragOver={(event) => {
              if (disabled) return;
              event.preventDefault();
              event.dataTransfer.dropEffect = "copy";
              if (!dragging) setDragging(true);
            }}
            onDragLeave={(event) => {
              // Moving over the icon or text inside the zone is not leaving it.
              const to = event.relatedTarget;
              if (to instanceof Node && event.currentTarget.contains(to)) return;
              setDragging(false);
            }}
            onDrop={(event) => {
              event.preventDefault();
              setDragging(false);
              pick(event.dataTransfer.files?.[0]);
            }}
            className={cn(
              "flex min-h-40 w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-6 text-center",
              "transition-colors duration-200 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary has-[:focus-visible]:ring-offset-2",
              disabled
                ? "cursor-not-allowed border-border-card bg-surface-card opacity-60"
                : dragging
                  ? "cursor-copy border-primary bg-primary-bg"
                  : "cursor-pointer border-border-card bg-surface-card hover:border-primary/60 hover:bg-primary-bg",
              pickError && !dragging && "border-destructive/60",
            )}
          >
            {fileInput}
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-primary-subtle text-primary">
              <ImagePlus className="h-5 w-5" aria-hidden />
            </span>
            <span className="text-sm font-semibold text-ink-secondary">
              {dragging ? "Drop the photo here" : "Choose a photo"}
            </span>
            <span className="hidden text-xs text-ink-muted sm:block">
              or drag it here
            </span>
          </label>

          {draft.kind === "remove" && initialUrl && (
            <div
              className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-surface-gray px-3 py-2 text-xs text-ink-tertiary"
              aria-live="polite"
            >
              <span>The current photo will be removed when you save.</span>
              <button
                type="button"
                onClick={() => change(KEEP_COVER_DRAFT)}
                disabled={disabled}
                className="inline-flex shrink-0 cursor-pointer items-center gap-1 rounded-md px-1.5 py-1 font-semibold text-primary transition-colors duration-200 hover:bg-primary-bg focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Undo2 className="h-3.5 w-3.5" aria-hidden />
                Undo
              </button>
            </div>
          )}
        </>
      )}

      <p id={hintId} className="mt-1.5 text-xs text-ink-muted">
        {HINT}
      </p>
      <FormError className="mt-1.5">
        {pickError && <span id={errorId}>{pickError}</span>}
      </FormError>
    </div>
  );
}
