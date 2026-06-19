"use client";

import { useState } from "react";
import { SquarePen } from "lucide-react";
import { CreatePostModal } from "./CreatePostModal";

/**
 * Floating compose button — bottom-right of the Home feed. Opens the
 * create-post composer.
 */
export function ComposeButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Create a post"
        className="fixed bottom-[calc(3.5rem+env(safe-area-inset-bottom)+1rem)] right-6 z-30 flex h-14 w-14 cursor-pointer items-center justify-center rounded-full border border-border-card bg-surface text-ink-tertiary shadow-md transition-colors duration-150 hover:bg-surface-gray hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 md:bottom-6"
      >
        <SquarePen className="h-5 w-5" aria-hidden />
      </button>
      {open && <CreatePostModal open onClose={() => setOpen(false)} />}
    </>
  );
}
