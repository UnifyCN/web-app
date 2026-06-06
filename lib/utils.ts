import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { SanityBlock } from "@/types";

/**
 * Merge class names with conflict resolution.
 * clsx handles conditionals; tailwind-merge dedupes conflicting utilities.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Flatten Portable Text blocks to a single plain string — concatenates each
 * block's span text and joins blocks with newlines. Used when a plain-text
 * representation is needed (e.g. an LLM prompt) rather than rendered markup.
 */
export function portableTextToPlain(blocks: SanityBlock[] | undefined): string {
  if (!Array.isArray(blocks)) return "";
  return blocks
    .map((block) =>
      (block.children ?? [])
        .map((span) => span.text ?? "")
        .join(""),
    )
    .join("\n")
    .trim();
}

/**
 * Short relative timestamp — "Just now", "5m", "3h", "2d", then a calendar
 * date with the year once past a week ("May 8, 2026").
 */
export function formatRelativeTime(iso: string): string {
  const date = new Date(iso);
  const now = new Date();
  const diffSec = Math.round((now.getTime() - date.getTime()) / 1000);

  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 7) return `${diffDay}d`;

  return date.toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
