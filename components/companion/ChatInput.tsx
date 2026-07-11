"use client";

import { Send } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

interface ChatInputProps {
  value: string;
  onValueChange: (value: string) => void;
  onSend: (text: string) => void;
  placeholder?: string;
  inputRef?: React.Ref<HTMLTextAreaElement>;
}

/** Companion message input — controlled; Enter sends, Shift+Enter inserts a newline. */
export function ChatInput({
  value,
  onValueChange,
  onSend,
  placeholder,
  inputRef,
}: ChatInputProps) {
  const { t } = useTranslation();
  const canSend = value.trim().length > 0;

  function send() {
    if (!canSend) return;
    onSend(value.trim());
  }

  return (
    <div className="flex items-end gap-2 rounded-3xl bg-surface-gray p-2">
      <textarea
        ref={inputRef}
        value={value}
        onChange={(event) => onValueChange(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault();
            send();
          }
        }}
        rows={1}
        placeholder={placeholder ?? t("companion.inputPlaceholder")}
        aria-label={t("companion.messageInputAria")}
        className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-base text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none"
      />
      <button
        type="button"
        onClick={send}
        disabled={!canSend}
        aria-label={t("companion.sendMessageAria")}
        className={cn(
          "flex h-9 w-9 shrink-0 items-center justify-center rounded-full transition-colors",
          canSend
            ? "cursor-pointer bg-primary text-white hover:bg-primary-dark"
            : "cursor-not-allowed bg-surface-input text-ink-placeholder",
        )}
      >
        <Send className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
