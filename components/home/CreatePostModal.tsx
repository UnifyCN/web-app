"use client";

import { useEffect, useState } from "react";
import { X, Check } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { cn } from "@/lib/utils";
import { groups } from "@/lib/mock/groups";

type Destination = "For You" | "Group";

const TITLE_MAX = 100;
const BODY_MAX = 2000;

interface CreatePostModalProps {
  open: boolean;
  onClose: () => void;
}

/** Create-post composer. Frontend stub — no post is actually created. */
export function CreatePostModal({ open, onClose }: CreatePostModalProps) {
  const [destination, setDestination] = useState<Destination>("For You");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [posted, setPosted] = useState(false);

  // Escape to close + lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);

  // Reset whenever the modal closes.
  useEffect(() => {
    if (!open) {
      setDestination("For You");
      setGroupId(null);
      setTitle("");
      setBody("");
      setPosted(false);
    }
  }, [open]);

  if (!open) return null;

  const canPost =
    title.trim().length > 0 &&
    body.trim().length > 0 &&
    (destination === "For You" || groupId !== null);

  function handlePost() {
    if (!canPost) return;
    // TODO: replace with real data — create the post via the backend.
    setPosted(true);
    window.setTimeout(onClose, 1300);
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-card bg-surface shadow-lg"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Create a post"
      >
        {posted ? (
          <div className="flex flex-col items-center px-6 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-priority-optional-bg">
              <Check className="h-6 w-6 text-priority-optional" aria-hidden />
            </span>
            <h2 className="mt-4 text-base font-semibold text-ink-secondary">
              Posted!
            </h2>
            <p className="mt-1 text-sm text-ink-muted">
              Your post is live in the feed.
            </p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border-card px-4 py-3">
              <button
                type="button"
                onClick={onClose}
                aria-label="Close"
                className="cursor-pointer rounded-md p-1 text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
              >
                <X className="h-5 w-5" aria-hidden />
              </button>
              <Button
                variant="primary"
                size="sm"
                disabled={!canPost}
                onClick={handlePost}
              >
                Post
              </Button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4">
              {/* Destination toggle */}
              <div className="flex gap-2">
                {(["For You", "Group"] as Destination[]).map((dest) => (
                  <button
                    key={dest}
                    type="button"
                    onClick={() => setDestination(dest)}
                    className={cn(
                      "cursor-pointer rounded-full border px-4 py-1.5 text-sm font-semibold transition-colors",
                      destination === dest
                        ? "border-primary bg-primary text-white"
                        : "border-border-card text-ink-muted hover:bg-surface-gray",
                    )}
                  >
                    {dest}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs italic text-ink-placeholder">
                {destination === "For You"
                  ? "Posting to For You feed"
                  : "Select a group to post"}
              </p>

              {/* Group picker */}
              {destination === "Group" && (
                <div className="mt-3 max-h-44 space-y-1 overflow-y-auto rounded-lg border border-border-card p-1">
                  {groups.map((group) => (
                    <button
                      key={group.id}
                      type="button"
                      onClick={() => setGroupId(group.id)}
                      className={cn(
                        "flex w-full cursor-pointer items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors",
                        groupId === group.id
                          ? "bg-primary-bg"
                          : "hover:bg-surface-gray",
                      )}
                    >
                      <Avatar
                        username={group.groupName}
                        profilePictureUrl={group.coverPhotoUrl}
                        size={28}
                      />
                      <span
                        className={cn(
                          "text-sm",
                          groupId === group.id
                            ? "font-semibold text-primary"
                            : "text-ink-secondary",
                        )}
                      >
                        {group.groupName}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* Title */}
              <div className="mt-5 border-b border-border-card pb-2">
                <input
                  type="text"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  maxLength={TITLE_MAX}
                  placeholder="Title"
                  aria-label="Post title"
                  className="w-full bg-transparent text-lg font-semibold text-ink-secondary placeholder:text-ink-placeholder focus-visible:outline-none"
                />
                <p className="mt-1 text-right text-xs text-ink-placeholder">
                  {title.length}/{TITLE_MAX}
                </p>
              </div>

              {/* Body */}
              <div className="mt-3">
                <textarea
                  value={body}
                  onChange={(event) => setBody(event.target.value)}
                  maxLength={BODY_MAX}
                  placeholder="What's on your mind?"
                  aria-label="Post body"
                  className="min-h-[160px] w-full resize-none bg-transparent text-sm leading-relaxed text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none"
                />
                <p className="text-right text-xs text-ink-placeholder">
                  {body.length}/{BODY_MAX}
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
