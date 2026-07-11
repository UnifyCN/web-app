import Link from "next/link";
import { Check } from "lucide-react";
import { useTranslation } from "react-i18next";

interface LessonListRowProps {
  href: string;
  title: string;
  isCompleted: boolean;
  /** Estimated read time in minutes. */
  readMinutes: number;
  /** Module accent colour for the completed-state dot. */
  colorHex: string;
}

/**
 * A single lesson row — completion dot + title + "{n} min read". Used in the
 * submodule landing lesson list and inside the module table of contents.
 */
export function LessonListRow({
  href,
  title,
  isCompleted,
  readMinutes,
  colorHex,
}: LessonListRowProps) {
  const { t } = useTranslation();
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-surface-card"
    >
      <span
        className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2"
        style={
          isCompleted
            ? { backgroundColor: colorHex, borderColor: colorHex }
            : { borderColor: "var(--color-border-card)" }
        }
      >
        {isCompleted && (
          <Check className="h-3 w-3 text-white" strokeWidth={3} aria-hidden />
        )}
      </span>
      <span className="min-w-0 flex-1 truncate text-sm text-ink-secondary transition-colors group-hover:text-ink">
        {title}
      </span>
      <span className="shrink-0 text-xs text-ink-placeholder">
        {t("learnWeb.module.minRead", { count: readMinutes })}
      </span>
    </Link>
  );
}
