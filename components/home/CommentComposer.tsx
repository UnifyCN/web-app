"use client";

import { useState } from "react";
import { Send, X } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import type { User } from "@/types";

interface CommentComposerProps {
  /** Signed-in user, for the leading avatar. */
  currentUser?: User | null;
  pending?: boolean;
  /** When set, shows a "Replying to @username" pill above the input. */
  replyingTo?: { username: string } | null;
  onCancelReply?: () => void;
  placeholder?: string;
  /** Called with the trimmed content; the composer clears on resolve. */
  onSubmit: (content: string) => Promise<void> | void;
}

/** Comment input — used for both top-level comments and replies. */
export function CommentComposer({
  currentUser,
  pending = false,
  replyingTo,
  onCancelReply,
  placeholder = "Add a comment…",
  onSubmit,
}: CommentComposerProps) {
  const [text, setText] = useState("");
  const trimmed = text.trim();

  async function submit() {
    if (!trimmed || pending) return;
    await onSubmit(trimmed);
    setText("");
  }

  return (
    <div className="rounded-card border border-border-card bg-surface p-3">
      {replyingTo && (
        <div className="mb-2 flex items-center justify-between rounded-md bg-primary-bg px-3 py-1.5 text-xs text-ink-muted">
          <span>
            Replying to{" "}
            <span className="font-semibold text-primary">
              @{replyingTo.username}
            </span>
          </span>
          {onCancelReply && (
            <button
              type="button"
              onClick={onCancelReply}
              aria-label="Cancel reply"
              className="cursor-pointer rounded p-0.5 text-ink-muted transition-colors hover:text-ink"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      )}
      <div className="flex items-start gap-3">
        <Avatar
          username={currentUser?.username ?? "You"}
          profilePictureUrl={currentUser?.profilePictureUrl}
          size={36}
        />
        <textarea
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder={placeholder}
          rows={2}
          onKeyDown={(event) => {
            if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
              event.preventDefault();
              void submit();
            }
          }}
          className="min-h-[2.5rem] flex-1 resize-none rounded-md bg-surface-input px-3 py-2 text-base text-ink placeholder:text-ink-placeholder focus:outline-none focus:ring-2 focus:ring-primary/40"
        />
        <Button
          size="sm"
          onClick={submit}
          disabled={!trimmed}
          loading={pending}
          leftIcon={<Send className="h-4 w-4" aria-hidden />}
        >
          {replyingTo ? "Reply" : "Post"}
        </Button>
      </div>
    </div>
  );
}
