import { Sparkles } from "lucide-react";

/** Small free-tier usage line shown near the chat input. */
export function FreeTierIndicator({ remaining }: { remaining: number }) {
  return (
    <p className="flex items-center justify-center gap-1 text-xs text-ink-placeholder">
      <Sparkles className="h-3 w-3" aria-hidden />
      {remaining} message{remaining === 1 ? "" : "s"}/day remaining
    </p>
  );
}
