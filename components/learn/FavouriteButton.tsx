"use client";

import type { CSSProperties } from "react";
import { Star } from "lucide-react";
import { useToggleFavouriteModule } from "@/hooks/useLearn";
import { cn } from "@/lib/utils";

interface FavouriteButtonProps {
  moduleId: string;
  isFavourite: boolean;
  /** Controls the star colour via `currentColor` (e.g. "text-white"). */
  className?: string;
  /** Inline style — pass `{ color }` to brand the star to a module colour. */
  style?: CSSProperties;
  /** Star size in px (default 18). */
  size?: number;
}

/**
 * Star toggle for favouriting a Learn module, wired to the existing optimistic
 * `useToggleFavouriteModule` mutation. Calls preventDefault/stopPropagation so
 * it can sit inside a card-level <Link> without triggering navigation. The star
 * fills with `currentColor` when active, so callers set the colour via
 * `className` / `style`.
 */
export function FavouriteButton({
  moduleId,
  isFavourite,
  className,
  style,
  size = 18,
}: FavouriteButtonProps) {
  const toggle = useToggleFavouriteModule();

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle.mutate({ moduleId, isFavourite: !isFavourite });
      }}
      disabled={toggle.isPending}
      aria-pressed={isFavourite}
      aria-label={isFavourite ? "Remove from saved" : "Save module"}
      className={cn(
        "inline-flex shrink-0 cursor-pointer items-center justify-center rounded-full p-2 disabled:cursor-default",
        className,
      )}
      style={style}
    >
      <Star
        className={isFavourite ? "fill-current" : "fill-none opacity-80"}
        style={{ width: size, height: size }}
        strokeWidth={1.75}
        aria-hidden
      />
    </button>
  );
}
