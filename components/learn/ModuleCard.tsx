"use client";

import Image from "next/image";
import Link from "next/link";
import { Heart } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LearnModule } from "@/types";

interface ModuleCardProps {
  mod: LearnModule;
  isFavourite: boolean;
  onToggleFavourite: (id: string) => void;
}

/** Image card for the Learn section rows — photo, favourite heart, title. */
export function ModuleCard({
  mod,
  isFavourite,
  onToggleFavourite,
}: ModuleCardProps) {
  return (
    <Link
      href={`/learn/${mod.id}`}
      className="relative block w-44 shrink-0 overflow-hidden rounded-card sm:w-48"
    >
      <div className="relative aspect-[4/3] w-full">
        <Image
          src={mod.bannerUrl}
          alt=""
          fill
          className="object-cover"
          sizes="200px"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-ink/80 via-ink/15 to-transparent" />
      </div>

      <button
        type="button"
        aria-label={
          isFavourite ? "Remove from favourites" : "Add to favourites"
        }
        aria-pressed={isFavourite}
        onClick={(event) => {
          event.preventDefault();
          onToggleFavourite(mod.id);
        }}
        className="absolute right-2 top-2 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full bg-ink/30 text-white backdrop-blur-sm transition-colors hover:bg-ink/50"
      >
        <Heart className={cn("h-4 w-4", isFavourite && "fill-current")} aria-hidden />
      </button>

      <span className="absolute inset-x-3 bottom-2 text-sm font-semibold leading-tight text-white">
        {mod.title}
      </span>
    </Link>
  );
}
