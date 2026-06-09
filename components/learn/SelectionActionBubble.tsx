"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { Highlighter, Sparkles, Trash2 } from "lucide-react";

interface SelectionActionBubbleProps {
  /** Viewport coords of the top-center of the selection. */
  x: number;
  y: number;
  /** Show the Remove action (selection overlaps an existing highlight). */
  canRemove: boolean;
  onHighlight: () => void;
  onRemove: () => void;
  onAskAI: () => void;
}

/**
 * Floating action menu shown above a text selection in the lesson reader.
 * Position is measured and clamped to the viewport (so it never renders
 * off-screen near an edge) before paint via `useLayoutEffect`. `onMouseDown` is
 * prevented so clicking a button doesn't collapse the native selection first.
 */
export function SelectionActionBubble({
  x,
  y,
  canRemove,
  onHighlight,
  onRemove,
  onAskAI,
}: SelectionActionBubbleProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    // Center horizontally on x (accounts for the previous -translate-x-1/2),
    // then clamp so neither edge leaves the viewport.
    let left = x - width / 2;
    left = Math.min(Math.max(left, margin), vw - width - margin);

    // Prefer above the selection; if there isn't room, drop just below it.
    let top = y - margin - height;
    if (top < margin) top = y + margin;
    top = Math.min(Math.max(top, margin), vh - height - margin);

    setPos({ left, top });
  }, [x, y, canRemove]);

  return (
    <div
      ref={ref}
      data-selection-bubble
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-[80] flex items-center gap-0.5 rounded-lg border border-ink-secondary/10 bg-ink-secondary px-1 py-1 shadow-lg"
      style={{
        left: pos ? pos.left : x,
        top: pos ? pos.top : y,
        visibility: pos ? "visible" : "hidden",
      }}
      role="toolbar"
      aria-label="Text selection actions"
    >
      <button
        type="button"
        onClick={onHighlight}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15"
      >
        <Highlighter className="h-3.5 w-3.5" aria-hidden />
        Highlight
      </button>
      {canRemove && (
        <button
          type="button"
          onClick={onRemove}
          className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15"
        >
          <Trash2 className="h-3.5 w-3.5" aria-hidden />
          Remove
        </button>
      )}
      <button
        type="button"
        onClick={onAskAI}
        className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-white/15"
      >
        <Sparkles className="h-3.5 w-3.5" aria-hidden />
        Ask AI
      </button>
    </div>
  );
}
