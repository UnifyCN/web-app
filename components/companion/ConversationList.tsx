"use client";

import { useState } from "react";
import { Search, SquarePen } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
}

/** Companion left panel — new-chat button, search, and the conversation list. */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const term = search.trim().toLowerCase();
  const items = conversations
    .map((conversation) => ({
      conversation,
      displayTitle: conversation.title ?? "New conversation",
    }))
    .filter(({ displayTitle }) =>
      displayTitle.toLowerCase().includes(term),
    );

  return (
    <aside className="flex w-[200px] shrink-0 flex-col border-r border-border-card bg-surface">
      <div className="space-y-3 p-3">
        <button
          type="button"
          onClick={onNew}
          className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <SquarePen className="h-4 w-4" aria-hidden />
          New conversation
        </button>
        <div className="relative">
          <Search
            className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder"
            aria-hidden
          />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search chats"
            aria-label="Search chats"
            className="h-9 w-full rounded-lg border border-border-card bg-surface pl-9 pr-3 text-sm text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          />
        </div>
      </div>

      <div className="scrollbar-thin flex-1 overflow-y-auto px-2 pb-2">
        {items.length > 0 ? (
          items.map(({ conversation, displayTitle }) => {
            const active = conversation.id === activeId;
            return (
              <button
                key={conversation.id}
                type="button"
                onClick={() => onSelect(conversation.id)}
                className={cn(
                  "flex w-full cursor-pointer flex-col items-start rounded-lg px-3 py-2 text-left transition-colors",
                  active ? "bg-primary-bg" : "hover:bg-surface-gray",
                )}
              >
                <span
                  className={cn(
                    "line-clamp-1 text-sm font-medium",
                    active ? "text-primary" : "text-ink-secondary",
                  )}
                >
                  {displayTitle}
                </span>
                <span className="mt-0.5 text-xs text-ink-placeholder">
                  {formatRelativeTime(conversation.updatedAt)}
                </span>
              </button>
            );
          })
        ) : (
          <p className="px-3 py-6 text-center text-xs text-ink-placeholder">
            No chats found.
          </p>
        )}
      </div>
    </aside>
  );
}
