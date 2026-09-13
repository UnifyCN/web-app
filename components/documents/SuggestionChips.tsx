import { Sparkles } from "lucide-react";

/**
 * Shared tappable example-answer chips for the document builders (Resume Builder
 * + Cover Letter Generator). Unlike Companion's follow-up chips (which auto-send),
 * these FILL the input with an editable suggestion so users with limited English
 * can pick a starting point and tweak it before sending.
 *
 * The hint copy is passed in (already translated) so this component carries no
 * hardcoded/i18n-namespaced strings. Empty/whitespace-only suggestions are
 * filtered out; renders nothing when none remain.
 */
export function SuggestionChips({
  suggestions,
  onPick,
  hint,
}: {
  suggestions: string[];
  onPick: (text: string) => void;
  /** Already-translated hint shown above the chips. */
  hint: string;
}) {
  const items = suggestions.filter((s) => s.trim());
  if (items.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="flex items-center gap-1 text-[11px] font-medium text-ink-placeholder">
        <Sparkles className="h-3 w-3" aria-hidden />
        {hint}
      </p>
      <div className="flex flex-wrap gap-2">
        {items.map((s, i) => (
          <button
            key={`${i}-${s}`}
            type="button"
            onClick={() => onPick(s)}
            className="cursor-pointer rounded-full border border-primary/40 bg-primary-bg px-3 py-1.5 text-start text-xs text-primary-dark transition-colors hover:bg-primary/10"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
