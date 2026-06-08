"use client";

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
 * `onMouseDown` is prevented so clicking a button doesn't collapse the native
 * selection before the handler runs.
 */
export function SelectionActionBubble({
  x,
  y,
  canRemove,
  onHighlight,
  onRemove,
  onAskAI,
}: SelectionActionBubbleProps) {
  return (
    <div
      data-selection-bubble
      onMouseDown={(e) => e.preventDefault()}
      className="fixed z-[80] flex -translate-x-1/2 -translate-y-full items-center gap-0.5 rounded-lg border border-ink-secondary/10 bg-ink-secondary px-1 py-1 shadow-lg"
      style={{ left: x, top: y - 8 }}
      role="menu"
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
