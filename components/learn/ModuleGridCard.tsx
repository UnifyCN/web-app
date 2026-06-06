import Link from "next/link";
import { Blob, type BlobVariant } from "./Blob";
import { FavouriteButton } from "./FavouriteButton";
import { ModuleIcon } from "./ModuleIcon";
import type { LearnModuleView } from "@/types";

interface ModuleGridCardProps {
  mod: LearnModuleView;
}

const BLOB_CYCLE = ["blob-3", "blob-8", "blob-10"] as const satisfies readonly BlobVariant[];

const BLOB_FIT: Record<(typeof BLOB_CYCLE)[number], string> = {
  "blob-3": "-top-12 -left-8 h-56 aspect-[225/242]",
  "blob-8": "-bottom-10 -right-8 h-64 aspect-[175/247]",
  "blob-10": "-top-6 -right-10 h-52 aspect-[261/229]",
};

export function ModuleGridCard({ mod }: ModuleGridCardProps) {
  const colorHex = mod.colorTheme?.hex ?? "#9F9D9D";
  const sectionCount = mod.submodules?.length ?? 0;
  const inProgress = mod.status === "in_progress";
  const variant = BLOB_CYCLE[mod._id.charCodeAt(0) % BLOB_CYCLE.length];

  return (
    <Link
      href={`/learn/${mod._id}`}
      className="group relative block aspect-[5/4] overflow-hidden rounded-card text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
      style={{ backgroundColor: colorHex }}
    >
      <Blob
        variant={variant}
        color="#ffffff"
        opacity={0.3}
        className={`absolute z-0 ${BLOB_FIT[variant]}`}
      />
      <div className="relative flex h-full flex-col justify-between p-4">
        <div className="flex items-start justify-between gap-2">
          {inProgress ? (
            <span
              className="rounded-full bg-white px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide"
              style={{ color: colorHex }}
            >
              Continue
            </span>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-1">
            <FavouriteButton
              moduleId={mod._id}
              isFavourite={mod.isFavourite}
              className="text-white"
            />
            <ModuleIcon
              icon={mod.icon}
              className="h-6 w-6 text-white"
              strokeWidth={1.75}
            />
          </div>
        </div>
        <div>
          <h3 className="line-clamp-2 text-base font-bold leading-tight">
            {mod.title}
          </h3>
          <p className="mt-1 text-xs text-white/85">
            {sectionCount} {sectionCount === 1 ? "section" : "sections"}
          </p>
        </div>
      </div>
    </Link>
  );
}
