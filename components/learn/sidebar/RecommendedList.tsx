import Link from "next/link";
import { ModuleIcon } from "../ModuleIcon";
import type { LearnModuleView } from "@/types";

export interface RecommendedItem {
  module: LearnModuleView;
  /** Human-readable reason (whyTag). */
  why: string;
}

/**
 * Sidebar widget: the top modules matching the user's onboarding interests +
 * persona, each with a short "why" line. Hidden when there's nothing to suggest.
 */
export function RecommendedList({ items }: { items: RecommendedItem[] }) {
  if (items.length === 0) return null;
  return (
    <section className="rounded-card border border-border-card bg-surface p-4">
      <h2 className="text-sm font-bold text-ink-secondary">
        Recommended for you
      </h2>
      <div className="mt-3 space-y-1">
        {items.map(({ module, why }) => (
          <Link
            key={module._id}
            href={`/learn/${module._id}`}
            className="flex items-center gap-2.5 rounded-md p-2 transition-colors hover:bg-surface-card"
          >
            <span
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-white"
              style={{ backgroundColor: module.colorTheme?.hex ?? "#9F9D9D" }}
            >
              <ModuleIcon
                icon={module.icon}
                className="h-4 w-4 text-white"
                strokeWidth={1.75}
              />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-semibold text-ink-secondary">
                {module.title}
              </p>
              {why && (
                <p className="truncate text-xs text-ink-placeholder">{why}</p>
              )}
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
