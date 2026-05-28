"use client";

import { useEffect, useRef, useState } from "react";
import { MoreHorizontal, Search, SquarePen, Trash2 } from "lucide-react";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Conversation } from "@/types";
import { DeleteConversationModal } from "./DeleteConversationModal";

interface ConversationListProps {
  conversations: Conversation[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (conversationIdentifier: string) => Promise<void>;
  isDeleting: boolean;
}

/** Companion left panel — new-chat button, search, and the conversation list. */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isDeleting,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    displayTitle: string;
  } | null>(null);
  const openMenuRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click or ESC. Single listener at document
  // level keyed on which menu is open.
  useEffect(() => {
    if (!openMenuFor) return;
    const onMouseDown = (event: MouseEvent) => {
      if (
        openMenuRef.current &&
        !openMenuRef.current.contains(event.target as Node)
      ) {
        setOpenMenuFor(null);
      }
    };
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpenMenuFor(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [openMenuFor]);

  const term = search.trim().toLowerCase();
  const items = conversations
    .map((conversation) => ({
      conversation,
      displayTitle: conversation.title ?? "New conversation",
    }))
    .filter(({ displayTitle }) =>
      displayTitle.toLowerCase().includes(term),
    );

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await onDelete(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Parent already logged. Keep the modal open with re-enabled buttons
      // (isDeleting flips false) so the user can retry or cancel.
    }
  }

  return (
    <>
      <aside className="flex w-[280px] shrink-0 flex-col border-r border-border-card bg-surface">
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
              const menuOpen = openMenuFor === conversation.id;
              return (
                <div
                  key={conversation.id}
                  className="group relative"
                >
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col items-start rounded-lg py-2 pl-3 pr-9 text-left transition-colors",
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
                  <div
                    ref={menuOpen ? openMenuRef : undefined}
                    className="absolute right-1 top-1.5"
                  >
                    <button
                      type="button"
                      onClick={() =>
                        setOpenMenuFor(menuOpen ? null : conversation.id)
                      }
                      aria-label="Conversation options"
                      aria-haspopup="menu"
                      aria-expanded={menuOpen}
                      className={cn(
                        "flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-opacity",
                        "hover:bg-surface focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        menuOpen
                          ? "opacity-100"
                          : "opacity-0 group-hover:opacity-100",
                      )}
                    >
                      <MoreHorizontal className="h-4 w-4" aria-hidden />
                    </button>
                    {menuOpen && (
                      <div
                        role="menu"
                        className="absolute right-0 top-full z-10 mt-1 w-32 overflow-hidden rounded-lg border border-border-card bg-surface py-1 shadow-lg"
                      >
                        <button
                          type="button"
                          role="menuitem"
                          onClick={() => {
                            setOpenMenuFor(null);
                            setDeleteTarget({
                              id: conversation.id,
                              displayTitle,
                            });
                          }}
                          className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-surface-gray"
                        >
                          <Trash2 className="h-4 w-4" aria-hidden />
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          ) : (
            <p className="px-3 py-6 text-center text-xs text-ink-placeholder">
              No chats found.
            </p>
          )}
        </div>
      </aside>
      <DeleteConversationModal
        open={deleteTarget !== null}
        conversationTitle={deleteTarget?.displayTitle ?? ""}
        isPending={isDeleting}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!isDeleting) setDeleteTarget(null);
        }}
      />
    </>
  );
}
