"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

/** Centred "Learn" page header with a Learn / Journey Map switcher. */
export function LearnHeaderDropdown() {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative inline-block">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex cursor-pointer items-center gap-1.5"
      >
        <span className="text-xl font-semibold text-ink-secondary">Learn</span>
        <span className="flex h-5 w-5 items-center justify-center rounded-full border border-border-card">
          <ChevronDown
            className={cn(
              "h-3 w-3 text-ink-muted transition-transform duration-200",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setOpen(false)}
            role="presentation"
          />
          <div className="absolute left-1/2 top-full z-20 mt-2 w-44 -translate-x-1/2 rounded-lg border border-border-card bg-surface p-1 shadow-md">
            <span className="block rounded-md bg-surface-gray px-3 py-2 text-sm font-semibold text-ink-secondary">
              Learn
            </span>
            <span className="block px-3 py-2 text-sm text-ink-placeholder">
              Journey Map
            </span>
          </div>
        </>
      )}
    </div>
  );
}
