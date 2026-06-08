import { cn } from "@/lib/utils";

export type SortMode = "relevant" | "az" | "newest";

const OPTIONS: { key: SortMode; label: string }[] = [
  { key: "relevant", label: "Relevant" },
  { key: "az", label: "A–Z" },
  { key: "newest", label: "Newest" },
];

/** Segmented control for module sort order. */
export function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  return (
    <div
      className="flex rounded-md border border-border-card p-0.5"
      role="group"
      aria-label="Sort modules"
    >
      {OPTIONS.map((o) => (
        <button
          key={o.key}
          type="button"
          onClick={() => onChange(o.key)}
          aria-pressed={value === o.key}
          className={cn(
            "flex-1 cursor-pointer rounded px-2 py-1.5 text-xs font-semibold transition-colors",
            value === o.key
              ? "bg-primary-bg text-primary"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
