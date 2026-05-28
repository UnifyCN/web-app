"use client";

import Link from "next/link";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LearnModuleView } from "@/types";

interface ModuleCardProps {
  mod: LearnModuleView;
  onToggleFavourite: (moduleId: string, next: boolean) => void;
}

/**
 * Image card for the Learn section rows. Modules carry `colorTheme.hex`
 * and a Material-icon name string (no Sanity image asset); the colour
 * block + gradient overlay + title is the visual identity for now.
 *
 * The favourite button is a sibling of the Link, not a child — interactive
 * content nested inside an anchor is invalid HTML and breaks keyboard /
 * screen-reader semantics.
 */
export function ModuleCard({ mod, onToggleFavourite }: ModuleCardProps) {
  const accentColor = mod.colorTheme?.hex ?? "#9F9D9D";

  return (
    <div className="relative w-44 shrink-0 sm:w-48">
      <Link
        href={`/learn/${mod._id}`}
        className="relative block overflow-hidden rounded-card"
      >
        <div
          className="relative aspect-[4/3] w-full"
          style={{ backgroundColor: accentColor }}
        >
          <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" />
        </div>
        <span className="absolute inset-x-3 bottom-2 text-sm font-semibold leading-tight text-white">
          {mod.title}
        </span>
      </Link>
      <button
        type="button"
        aria-label={
          mod.isFavourite ? "Remove from favourites" : "Add to favourites"
        }
        aria-pressed={mod.isFavourite}
        onClick={() => onToggleFavourite(mod._id, !mod.isFavourite)}
        className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-ink/30 text-white backdrop-blur-sm transition-colors hover:bg-ink/50"
      >
        <Heart
          className={cn("h-4 w-4", mod.isFavourite && "fill-current")}
          aria-hidden
        />
      </button>
    </div>
  );
}
