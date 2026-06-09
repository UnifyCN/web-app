import Link from "next/link";
import { ChevronRight, FileText } from "lucide-react";

interface LessonSearchResultProps {
  href: string;
  lessonTitle: string;
  submoduleTitle: string;
  moduleTitle: string;
  /** Module accent colour for the leading glyph. */
  colorHex: string;
}

/**
 * A lesson hit in the Learn search results — lesson title + its
 * "Submodule · Module" breadcrumb, linking straight to the lesson.
 */
export function LessonSearchResult({
  href,
  lessonTitle,
  submoduleTitle,
  moduleTitle,
  colorHex,
}: LessonSearchResultProps) {
  return (
    <Link
      href={href}
      className="group flex items-center gap-3 rounded-card border border-border-card bg-surface p-3 transition-colors hover:bg-surface-card"
    >
      <span
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md text-white"
        style={{ backgroundColor: colorHex }}
      >
        <FileText className="h-4 w-4" aria-hidden />
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-ink-secondary">
          {lessonTitle}
        </p>
        <p className="truncate text-xs text-ink-placeholder">
          {submoduleTitle} · {moduleTitle}
        </p>
      </div>
      <ChevronRight
        className="h-4 w-4 shrink-0 text-ink-placeholder transition-transform group-hover:translate-x-0.5"
        aria-hidden
      />
    </Link>
  );
}
