import Link from "next/link";
import { Blob, type BlobVariant } from "./Blob";
import { FavouriteButton } from "./FavouriteButton";
import { ModuleIcon } from "./ModuleIcon";
import { ProgressRing } from "./ProgressRing";
import { moduleProgressMessage } from "@/lib/learn/microcopy";
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
  const colorHex = mod.colorTheme?.hex ?? "var(--color-ink-placeholder)";
  const sectionCount = mod.submodules?.length ?? 0;
  const inProgress = mod.status === "in_progress";
  const percent = mod.progressPercent ?? 0;
  const variant = BLOB_CYCLE[mod._id.charCodeAt(0) % BLOB_CYCLE.length];

  return (
    <Link
      href={`/learn/${mod._id}`}
      className="group relative block aspect-[5/4] overflow-hidden rounded-card text-white shadow-sm transition-all duration-200 hover:scale-[1.02] hover:shadow-md"
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
        <div className="flex items-end justify-between gap-2">
          <div className="min-w-0">
            <h3 className="line-clamp-2 text-base font-bold leading-tight">
              {mod.title}
            </h3>
            <p className="mt-1 text-xs text-white/85">
              {sectionCount} {sectionCount === 1 ? "section" : "sections"}
            </p>
            {percent < 100 && (
              <p className="mt-0.5 text-[11px] font-medium text-white/90">
                {moduleProgressMessage(percent)}
              </p>
            )}
          </div>
          {percent >= 100 ? (
            <span
              className="shrink-0 whitespace-nowrap rounded-full bg-white px-2 py-1 text-[11px] font-bold"
              style={{ color: colorHex }}
            >
              ✓ Complete 🎉
            </span>
          ) : (
            <ProgressRing
              percent={percent}
              size={40}
              stroke={3}
              showLabel={false}
              trackColor="rgba(255,255,255,0.35)"
              progressColor="#ffffff"
            />
          )}
        </div>
      </div>
    </Link>
  );
}
