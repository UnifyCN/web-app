"use client";

import { useState } from "react";
import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

/** Server-side CHECK allows 1–5000 chars (module_discussions / replies). */
const MAX_BODY = 5000;

/**
 * Shared composer for new questions + replies (purple accent — community
 * path). Controlled internally; clears on successful submit via the parent
 * resolving `onSubmit`. Cmd/Ctrl+Enter submits, Enter inserts a newline
 * (questions are long-form, unlike chat).
 */
export function DiscussionComposer({
  placeholder,
  isPending,
  onSubmit,
  errorMessage,
  autoFocus = false,
  compact = false,
}: {
  placeholder: string;
  isPending: boolean;
  /** Resolves on success (composer clears); rejects on failure (text kept). */
  onSubmit: (body: string) => Promise<void>;
  /** Surfaced under the field — e.g. the community-guidelines rejection. */
  errorMessage?: string | null;
  autoFocus?: boolean;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [body, setBody] = useState("");
  const trimmed = body.trim();
  const canSubmit = trimmed.length > 0 && !isPending;

  async function submit() {
    if (!canSubmit) return;
    try {
      await onSubmit(trimmed);
      setBody("");
    } catch {
      // Parent surfaces the error (errorMessage); keep the draft for editing.
    }
  }

  return (
    <div>
      <div className="flex items-end gap-2 rounded-card border border-border-card bg-surface p-2">
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value.slice(0, MAX_BODY))}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              void submit();
            }
          }}
          rows={compact ? 1 : 2}
          maxLength={MAX_BODY}
          autoFocus={autoFocus}
          placeholder={placeholder}
          aria-label={placeholder}
          disabled={isPending}
          className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none"
        />
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canSubmit}
          aria-label={t("learnWeb.discussion.postAria")}
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
            canSubmit
              ? "cursor-pointer bg-purple-600 text-white hover:bg-purple-700"
              : "cursor-not-allowed bg-surface-input text-ink-placeholder",
          )}
        >
          <Send className="h-4 w-4" aria-hidden />
        </button>
      </div>
      <div className="mt-1 flex items-center justify-between gap-2">
        {errorMessage ? (
          <p role="alert" className="text-xs font-medium text-destructive">
            {errorMessage}
          </p>
        ) : (
          <span />
        )}
        {body.length > MAX_BODY * 0.9 && (
          <span className="shrink-0 text-xs text-ink-placeholder">
            {body.length}/{MAX_BODY}
          </span>
        )}
      </div>
    </div>
  );
}
