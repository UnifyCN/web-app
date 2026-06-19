"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  /** Mobile master/detail: is the list the visible pane (vs the chat)? */
  mobileActive: boolean;
}

/**
 * Portaled row menu. Rendered into document.body so the sidebar's
 * overflow-y-auto scroll container can't clip it. Position is recomputed
 * on scroll/resize so it stays anchored to its button when the list scrolls.
 */
function RowMenu({
  anchorRef,
  portalRef,
  onDelete,
}: {
  anchorRef: React.RefObject<HTMLButtonElement | null>;
  portalRef: React.RefObject<HTMLDivElement | null>;
  onDelete: () => void;
}) {
  const [pos, setPos] = useState<{ top: number; right: number } | null>(null);

  useLayoutEffect(() => {
    function update() {
      const rect = anchorRef.current?.getBoundingClientRect();
      if (!rect) return;
      setPos({
        top: rect.bottom + 4,
        // distance from the right edge of the viewport
        right: window.innerWidth - rect.right,
      });
    }
    update();
    // Capture phase so nested scroll containers (the sidebar's
    // overflow-y-auto) also trigger the listener.
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorRef]);

  if (!pos) return null;
  return createPortal(
    <div
      ref={portalRef}
      role="menu"
      style={{ position: "fixed", top: pos.top, right: pos.right }}
      className="z-50 w-32 overflow-hidden rounded-lg border border-border-card bg-surface py-1 shadow-lg"
    >
      <button
        type="button"
        role="menuitem"
        onClick={onDelete}
        className="flex w-full cursor-pointer items-center gap-2 px-3 py-1.5 text-left text-sm text-destructive hover:bg-surface-gray"
      >
        <Trash2 className="h-4 w-4" aria-hidden />
        Delete
      </button>
    </div>,
    document.body,
  );
}

/** Companion left panel — new-chat button, search, and the conversation list. */
export function ConversationList({
  conversations,
  activeId,
  onSelect,
  onNew,
  onDelete,
  isDeleting,
  mobileActive,
}: ConversationListProps) {
  const [search, setSearch] = useState("");
  const [openMenuFor, setOpenMenuFor] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    displayTitle: string;
  } | null>(null);
  // One pair of refs across the list — both attached only to the currently-
  // open row's anchor/portal. The dismissal handler checks both.
  const openAnchorRef = useRef<HTMLButtonElement>(null);
  const openPortalRef = useRef<HTMLDivElement>(null);

  // Close the popover on outside click or ESC. Click is "outside" only if
  // it's in neither the anchor button nor the portaled menu.
  useEffect(() => {
    if (!openMenuFor) return;
    const onMouseDown = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        openAnchorRef.current?.contains(target) ||
        openPortalRef.current?.contains(target)
      ) {
        return;
      }
      setOpenMenuFor(null);
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
      <aside
        className={cn(
          // Full-width on mobile (master/detail); a 240px rail at md+.
          "w-full shrink-0 flex-col border-r border-border-card bg-surface md:flex md:w-[240px]",
          mobileActive ? "flex" : "hidden",
        )}
      >
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
                <div key={conversation.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => onSelect(conversation.id)}
                    className={cn(
                      "flex w-full cursor-pointer flex-col items-start rounded-lg py-2 pl-3 pr-11 text-left transition-colors",
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
                  <button
                    ref={menuOpen ? openAnchorRef : undefined}
                    type="button"
                    onClick={() =>
                      setOpenMenuFor(menuOpen ? null : conversation.id)
                    }
                    aria-label="Conversation options"
                    aria-haspopup="menu"
                    aria-expanded={menuOpen}
                    className={cn(
                      "absolute right-1 top-1.5 flex h-9 w-9 cursor-pointer items-center justify-center rounded-md text-ink-muted transition-opacity",
                      "hover:bg-surface focus-visible:opacity-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                      // Always visible on touch (no hover); hover-reveal at md+.
                      menuOpen
                        ? "opacity-100"
                        : "opacity-100 md:opacity-0 md:group-hover:opacity-100",
                    )}
                  >
                    <MoreHorizontal className="h-4 w-4" aria-hidden />
                  </button>
                  {menuOpen && (
                    <RowMenu
                      anchorRef={openAnchorRef}
                      portalRef={openPortalRef}
                      onDelete={() => {
                        setOpenMenuFor(null);
                        setDeleteTarget({
                          id: conversation.id,
                          displayTitle,
                        });
                      }}
                    />
                  )}
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
