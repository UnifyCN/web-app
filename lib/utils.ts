import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import type { FocusEvent } from "react";
import type { SanityBlock } from "@/types";

/**
 * Merge class names with conflict resolution.
 * clsx handles conditionals; tailwind-merge dedupes conflicting utilities.
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Horizontally mirrors a directional icon (back-arrows, chevrons, pagers) under
 * RTL, keying off the `dir="rtl"` on `<html>`. Opt-in per icon — compose via
 * `cn(...)`, e.g. `<ChevronLeft className={cn("h-5 w-5", RTL_FLIP)} />`. Leave it
 * off non-directional icons (a kebab "…", a close "×", etc.).
 */
export const RTL_FLIP = "rtl:-scale-x-100";

/** Escape a string for safe use inside a `RegExp`. */
export function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Strip HTML tags from a string and decode the common entities, returning clean
 * plain text. Some older mobile posts/comments stored raw HTML in their body
 * (`<h4>Hi</h4><p>text</p>`); the web renders feed content as escaped text, so
 * we flatten the markup here rather than render it. Block-level tags become line
 * breaks so adjacent blocks don't run together ("Hi" + "text" -> "Hi\ntext").
 * SSR-safe (no DOM) and a no-op on plain text — the fast-path returns the input
 * untouched when there's no `<tag` or `&entity` to act on, so a normal post is
 * unchanged (and harmless inputs like "5 < 10" survive: only letter-anchored
 * tags match).
 */
export function stripHtml(value: string): string {
  if (!value) return value;
  if (!/<[a-z!/]/i.test(value) && !/&[a-z#]/i.test(value)) return value;
  return value
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(?:p|div|h[1-6]|li|tr|ul|ol|blockquote)\s*>/gi, "\n")
    .replace(/<\/?[a-z][a-z0-9]*\b[^>]*>/gi, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0*39;|&apos;/gi, "'")
    .replace(/&amp;/gi, "&")
    .replace(/[ \t]+/g, " ")
    .replace(/[ \t]*\n[ \t]*/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
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
 * Validate an external link for safe use as an `href`. Returns the URL only
 * when it's an absolute http(s) link, otherwise null (so callers can render a
 * non-clickable fallback). Guards against javascript:/data: and relative junk.
 */
export function externalHref(link: string | null | undefined): string | null {
  if (!link) return null;
  try {
    // Parse (not startsWith) so mixed-case protocols and whitespace-padded
    // URLs validate, and javascript:/data:/relative inputs are rejected.
    const url = new URL(link.trim());
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.href
      : null;
  } catch {
    return null;
  }
}

/**
 * True when a citation URL points at an internal knowledge-base file rather than
 * a public source. `rag-query` resolves each source URL as `source_url || s3Url`,
 * so docs without a backfilled `source_url` fall back to a raw S3 link
 * (`https://<bucket>.s3.<region>.amazonaws.com/<path>`). Those internal files must
 * never be shown to users as citations — the web app drops them on display.
 * Matches on the host (not the whole URL), and anchors the `s3` checks to the
 * start of the host so `datas3.example.com` or a path like ".../s3.pdf" can't
 * false-positive and silently hide a valid public citation. Real AWS S3 URLs
 * (`<bucket>.s3.<region>.amazonaws.com`) are still caught by the `amazonaws.com`
 * check; the `s3.`/`s3-` prefixes only add genuine S3-compatible hosts
 * (e.g. `s3.wasabisys.com`). Falls back to a raw-string check if the URL won't
 * parse, using only the unambiguous `amazonaws.com` signal.
 */
export function isInternalSourceUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const host = new URL(url).hostname.toLowerCase();
    return (
      host.includes("amazonaws.com") ||
      host.startsWith("s3.") ||
      host.startsWith("s3-")
    );
  } catch {
    return url.toLowerCase().includes("amazonaws.com");
  }
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

/**
 * Move the text caret to the end of a field on focus. iOS Safari (and some
 * desktop cases) drop the caret at the START of a pre-filled input, so editing an
 * existing value means manually moving to the end first. Use as an `onFocus`
 * handler on fields that arrive pre-filled. Guarded: `setSelectionRange` throws on
 * input types that don't support text selection (e.g. `type="email"`), so those
 * just keep their default caret behavior.
 */
export function moveCaretToEnd(
  e: FocusEvent<HTMLInputElement | HTMLTextAreaElement>,
): void {
  const el = e.currentTarget;
  try {
    const n = el.value.length;
    el.setSelectionRange(n, n);
  } catch {
    // input type doesn't support text selection — leave the caret as-is.
  }
}
