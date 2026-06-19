"use client";

import { useState } from "react";
import { Check, ChevronDown, ChevronUp, Copy, Globe } from "lucide-react";
import { cn } from "@/lib/utils";
import type { ChatMessage, ChatSource } from "@/types";

interface MessageBubbleProps {
  message: ChatMessage;
  groupedWithPrev: boolean;
  groupedWithNext: boolean;
  /** True for the last message in the thread — gates the follow-up chips. */
  isLast?: boolean;
  /** Pre-fills the input with a follow-up suggestion (assistant chips). */
  onSuggestionClick?: (text: string) => void;
}

/** Host portion of a source URL ("www.canada.ca"), or "" if unparseable. */
function hostFromUrl(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

/** Collapsible "Sources (N)" list — full-width rows with domain + linked title. */
function SourceList({ sources }: { sources: ChatSource[] }) {
  // Collapsed by default — users expand if they want to inspect citations.
  const [open, setOpen] = useState(false);

  return (
    <div className="mt-3 border-t border-border-card pt-3">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between text-sm font-semibold text-ink-secondary"
      >
        <span>Sources ({sources.length})</span>
        {open ? (
          <ChevronUp className="h-4 w-4 text-ink-muted" aria-hidden />
        ) : (
          <ChevronDown className="h-4 w-4 text-ink-muted" aria-hidden />
        )}
      </button>

      {open && (
        <ul className="mt-2 space-y-1.5">
          {sources.map((source) => {
            const host = hostFromUrl(source.url);
            return (
              <li key={`${source.url}-${source.title}`}>
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex items-center gap-2 rounded-lg bg-surface-gray px-3 py-2 text-xs transition-colors hover:bg-surface-input"
                >
                  <Globe
                    className="h-4 w-4 shrink-0 text-ink-placeholder"
                    aria-hidden
                  />
                  {host && (
                    <span className="flex shrink-0 items-center gap-2 text-ink-muted">
                      {host}
                      <span className="text-ink-placeholder">·</span>
                    </span>
                  )}
                  <span className="truncate text-mention-blue group-hover:underline">
                    {source.title}
                  </span>
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** Assistant reply — a white card with copy, sources, and follow-up chips. */
function AssistantMessage({
  message,
  isLast,
  onSuggestionClick,
}: {
  message: ChatMessage;
  isLast?: boolean;
  onSuggestionClick?: (text: string) => void;
}) {
  const [copied, setCopied] = useState(false);

  function copy() {
    void navigator.clipboard.writeText(message.content);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1500);
  }

  return (
    <div className="mt-4 flex animate-message-in justify-start">
      <div className="relative w-full rounded-2xl border border-border-card bg-surface px-4 py-3.5 shadow-sm">
        <button
          type="button"
          onClick={copy}
          aria-label={copied ? "Copied" : "Copy message"}
          className="absolute right-2.5 top-2.5 flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-placeholder transition-colors hover:bg-surface-gray hover:text-ink-muted"
        >
          {copied ? (
            <Check className="h-4 w-4" aria-hidden />
          ) : (
            <Copy className="h-4 w-4" aria-hidden />
          )}
        </button>

        <p className="whitespace-pre-wrap pr-8 text-[15px] leading-relaxed text-ink-secondary">
          {message.content}
        </p>

        {message.sources && message.sources.length > 0 && (
          <SourceList sources={message.sources} />
        )}

        {isLast &&
          message.suggestedNextSteps &&
          message.suggestedNextSteps.length > 0 && (
            <div className="mt-3 border-t border-border-card pt-3">
              <p className="mb-2 text-xs font-medium text-ink-muted">
                Ask a follow-up:
              </p>
              <div className="flex flex-wrap gap-2">
                {message.suggestedNextSteps.map((question) => (
                  <button
                    key={question}
                    type="button"
                    onClick={() => onSuggestionClick?.(question)}
                    className="cursor-pointer rounded-full border border-mention-blue/50 px-3 py-1.5 text-left text-xs text-mention-blue transition-colors hover:bg-mention-blue/5"
                  >
                    {question}
                  </button>
                ))}
              </div>
            </div>
          )}
      </div>
    </div>
  );
}

/** User message — right-aligned orange bubble. */
function UserMessage({
  message,
  groupedWithPrev,
  groupedWithNext,
}: MessageBubbleProps) {
  return (
    <div
      className={cn(
        "flex animate-message-in justify-end",
        groupedWithPrev ? "mt-1" : "mt-4",
      )}
    >
      <div
        className={cn(
          "max-w-[80%] rounded-2xl bg-primary-light px-4 py-2.5 text-sm leading-relaxed text-white",
          groupedWithPrev && "rounded-tr-md",
          groupedWithNext && "rounded-br-md",
        )}
      >
        <p className="whitespace-pre-wrap">{message.content}</p>
      </div>
    </div>
  );
}

/** A single chat message — user (right bubble) or assistant (left card). */
export function MessageBubble(props: MessageBubbleProps) {
  if (props.message.role === "user") {
    return <UserMessage {...props} />;
  }
  return (
    <AssistantMessage
      message={props.message}
      isLast={props.isLast}
      onSuggestionClick={props.onSuggestionClick}
    />
  );
}
