"use client";

import { useEffect, useState } from "react";
import { MessageCircleQuestion } from "lucide-react";
import { cn } from "@/lib/utils";

/** How many lesson views keep the first-run discoverability pulse. */
const PULSE_VIEW_LIMIT = 3;
const VIEWS_STORAGE_KEY = "unify.helpFabViews";

/**
 * Floating In-Lesson Help bubble (PRD R1). Fixed bottom-right of the viewport,
 * offset above the mobile BottomNav (and the iOS home indicator) so it never
 * covers the Back/Next bar's tap targets. The AI→Community teal→purple gradient
 * mark reads as "help" at a glance; a subtle pulse ring runs for the first few
 * lesson views (localStorage-counted), then settles to static. The ring is
 * suppressed under prefers-reduced-motion.
 */
export function HelpFab({ onOpen }: { onOpen: () => void }) {
  const [pulse, setPulse] = useState(false);

  // Count a "view" per mount (the pager remounts per lesson). localStorage is
  // unavailable during SSR and reading it in a lazy initializer would cause a
  // hydration mismatch, so the client-only pulse flag is set post-mount — the
  // standard hydration-safe pattern for client-only decorative UI.
  useEffect(() => {
    try {
      const views = Number(localStorage.getItem(VIEWS_STORAGE_KEY) ?? "0");
      if (views < PULSE_VIEW_LIMIT) {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- hydration-safe client-only flag; runs once on mount
        setPulse(true);
        localStorage.setItem(VIEWS_STORAGE_KEY, String(views + 1));
      }
    } catch {
      // Storage blocked (private mode) — skip the pulse, keep the button.
    }
  }, []);

  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label="Get help with this lesson"
      className={cn(
        "fixed right-4 z-40 flex h-12 w-12 cursor-pointer items-center justify-center",
        "rounded-2xl bg-gradient-to-br from-teal-600 to-purple-600 text-white shadow-lg",
        "transition-transform hover:scale-105 active:scale-95",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2",
        // Clear the fixed BottomNav (+ safe area) on mobile; sit lower on md+
        // where the sidebar layout has no bottom bar.
        "bottom-[calc(5rem+env(safe-area-inset-bottom))] md:bottom-6 md:right-6",
      )}
    >
      {pulse && (
        <span
          aria-hidden
          className="absolute inset-0 -z-10 animate-ping rounded-2xl bg-teal-600/40 motion-reduce:hidden"
        />
      )}
      <MessageCircleQuestion className="h-6 w-6" strokeWidth={2} aria-hidden />
    </button>
  );
}
