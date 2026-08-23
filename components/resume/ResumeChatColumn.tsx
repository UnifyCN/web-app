"use client";

import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FileText,
  Plus,
  Trash2,
  PanelRight,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, RTL_FLIP } from "@/lib/utils";
import { ChatInput } from "@/components/companion/ChatInput";
import { ResumeSuggestionChips } from "./ResumeSuggestionChips";
import type { ResumeChatMessage, ResumeDraft, ResumeDraftSummary } from "@/types/resume";

function TypingIndicator() {
  return (
    <div className="mt-4 flex justify-start">
      <div className="flex items-center gap-1 rounded-2xl border border-border-card bg-surface px-4 py-3">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="h-1.5 w-1.5 animate-typing-dot rounded-full bg-ink-inactive"
            style={{ animationDelay: `${i * 160}ms` }}
          />
        ))}
      </div>
    </div>
  );
}

function Bubble({ message }: { message: ResumeChatMessage }) {
  if (message.role === "user") {
    return (
      <div className="mt-4 flex animate-message-in justify-end">
        <div className="max-w-[85%] rounded-2xl bg-primary-light px-4 py-2.5 text-sm leading-relaxed text-white">
          <p className="whitespace-pre-wrap">{message.content}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mt-4 flex animate-message-in justify-start">
      <div className="w-full rounded-2xl border border-border-card bg-surface px-4 py-3 shadow-sm">
        <p className="whitespace-pre-wrap text-[15px] leading-relaxed text-ink-secondary">
          {message.content}
        </p>
      </div>
    </div>
  );
}

/** Compact drafts switcher in the chat header (avoids a third column). */
function DraftsMenu({
  drafts,
  activeId,
  onSelect,
  onNew,
  onDelete,
}: {
  drafts: ResumeDraftSummary[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const active = drafts.find((d) => d.id === activeId);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  return (
    <div ref={menuRef} className="relative min-w-0 flex-1">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full min-w-0 cursor-pointer items-center gap-1.5 rounded-lg px-2 py-1.5 text-start transition-colors hover:bg-surface-gray"
      >
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
        <span className="truncate text-sm font-semibold text-ink-secondary">
          {active?.title ?? t("resume.title")}
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-ink-placeholder" aria-hidden />
      </button>

      {open && (
        <div className="absolute start-0 top-full z-20 mt-1 w-72 max-w-[85vw] overflow-hidden rounded-xl border border-border-card bg-surface shadow-lg">
          <button
            type="button"
            onClick={() => {
              onNew();
              setOpen(false);
            }}
            className="flex w-full cursor-pointer items-center gap-2 border-b border-border-card px-3 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary-bg"
          >
            <Plus className="h-4 w-4" aria-hidden />
            {t("resume.newResume")}
          </button>
          <ul className="max-h-72 overflow-y-auto py-1">
            {drafts.length === 0 && (
              <li className="px-3 py-2 text-xs text-ink-placeholder">
                {t("resume.noDrafts")}
              </li>
            )}
            {drafts.map((d) => (
              <li key={d.id} className="group flex items-center">
                <button
                  type="button"
                  onClick={() => {
                    onSelect(d.id);
                    setOpen(false);
                  }}
                  className={cn(
                    "min-w-0 flex-1 cursor-pointer truncate px-3 py-2 text-start text-sm transition-colors hover:bg-surface-gray",
                    d.id === activeId
                      ? "font-semibold text-primary"
                      : "text-ink-secondary",
                  )}
                >
                  {d.title}
                </button>
                <button
                  type="button"
                  onClick={() => onDelete(d.id)}
                  aria-label={t("resume.deleteDraft")}
                  className="me-1 flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-placeholder opacity-0 transition-opacity hover:bg-surface-gray hover:text-destructive group-hover:opacity-100 focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
                >
                  <Trash2 className="h-4 w-4" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

interface ResumeChatColumnProps {
  draft: ResumeDraft | null;
  drafts: ResumeDraftSummary[];
  activeId: string | null;
  isTyping: boolean;
  errorMessage: string | null;
  remaining: number;
  limitReached: boolean;
  onSend: (text: string) => void;
  onSelectDraft: (id: string) => void;
  onNewDraft: () => void;
  onDeleteDraft: (id: string) => void;
  /** Mobile master/detail: is the chat the visible pane (vs the resume)? */
  mobileActive: boolean;
  /** Mobile master/detail: reveal the resume pane. */
  onShowResume: () => void;
}

export function ResumeChatColumn({
  draft,
  drafts,
  activeId,
  isTyping,
  errorMessage,
  remaining,
  limitReached,
  onSend,
  onSelectDraft,
  onNewDraft,
  onDeleteDraft,
  mobileActive,
  onShowResume,
}: ResumeChatColumnProps) {
  const { t } = useTranslation();
  const [input, setInput] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messages = draft?.messages ?? [];

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, isTyping]);

  function handleSend(text: string) {
    // Block a second send while a turn is in flight — concurrent turns would
    // read the same persisted draft and clobber each other's messages.
    if (isTyping) return;
    onSend(text);
    setInput("");
  }

  // Chips come from the latest assistant turn — shown only when we're waiting
  // for the user (not mid-generation). Tapping fills the input for editing.
  const lastMessage = messages[messages.length - 1];
  const activeSuggestions =
    !isTyping && lastMessage?.role === "assistant"
      ? (lastMessage.suggestions ?? [])
      : [];

  function pickSuggestion(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  return (
    <div
      className={cn(
        "h-full min-w-0 flex-col bg-surface md:flex md:w-[400px] md:shrink-0 md:border-e md:border-border-card lg:w-[440px]",
        mobileActive ? "flex" : "hidden",
      )}
    >
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-border-card px-3">
        <DraftsMenu
          drafts={drafts}
          activeId={activeId}
          onSelect={onSelectDraft}
          onNew={onNewDraft}
          onDelete={onDeleteDraft}
        />
        <button
          type="button"
          onClick={onShowResume}
          aria-label={t("resume.viewResume")}
          className="flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink md:hidden"
        >
          <PanelRight className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
        </button>
      </header>

      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-2xl px-4 py-5">
          {messages.map((m) => (
            <Bubble key={m.id} message={m} />
          ))}
          {isTyping && <TypingIndicator />}
          <div ref={endRef} />
        </div>
      </div>

      <div className="space-y-2 border-t border-border-card px-4 py-3">
        {activeSuggestions.length > 0 && (
          <ResumeSuggestionChips
            suggestions={activeSuggestions}
            onPick={pickSuggestion}
          />
        )}
        {errorMessage && (
          <p role="alert" className="text-center text-xs font-medium text-destructive">
            {errorMessage}
          </p>
        )}
        {limitReached ? (
          <div className="rounded-2xl bg-surface-gray px-4 py-3 text-center text-xs text-ink-muted">
            {t("resume.limitReached")}
          </div>
        ) : (
          <ChatInput
            value={input}
            onValueChange={setInput}
            onSend={handleSend}
            inputRef={inputRef}
            placeholder={t("resume.inputPlaceholder")}
            disabled={isTyping}
          />
        )}
        <p className="text-center text-[11px] text-ink-placeholder">
          {t("resume.messagesRemaining", { count: remaining })}
        </p>
      </div>
    </div>
  );
}
