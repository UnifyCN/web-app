import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";

export type SortMode = "relevant" | "az" | "newest";

const OPTIONS: SortMode[] = ["relevant", "az", "newest"];

/** Segmented control for module sort order. */
export function SortControl({
  value,
  onChange,
}: {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}) {
  const { t } = useTranslation();
  return (
    <div
      className="flex rounded-md border border-border-card p-0.5"
      role="group"
      aria-label={t("learnWeb.sidePanel.sortModulesAria")}
    >
      {OPTIONS.map((key) => (
        <button
          key={key}
          type="button"
          onClick={() => onChange(key)}
          aria-pressed={value === key}
          className={cn(
            "flex-1 cursor-pointer rounded px-2 py-1.5 text-xs font-semibold transition-colors",
            value === key
              ? "bg-primary-bg text-primary"
              : "text-ink-muted hover:text-ink",
          )}
        >
          {t(`learnWeb.sidePanel.sort.${key}`)}
        </button>
      ))}
    </div>
  );
}
