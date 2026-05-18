import { ChevronRight } from "lucide-react";
import { ModuleCard } from "./ModuleCard";
import type { LearnModule } from "@/types";

interface LearnSectionProps {
  title: string;
  modules: LearnModule[];
  favourites: Set<string>;
  onToggleFavourite: (id: string) => void;
}

/** A Learn home section card — heading + a horizontal row of module cards. */
export function LearnSection({
  title,
  modules,
  favourites,
  onToggleFavourite,
}: LearnSectionProps) {
  if (modules.length === 0) return null;

  return (
    <section className="rounded-card border border-border-card bg-surface p-4">
      <div className="flex items-center gap-1">
        <h2 className="text-base font-semibold text-ink-secondary">{title}</h2>
        <ChevronRight className="h-4 w-4 text-ink-tertiary" aria-hidden />
      </div>
      <div className="scrollbar-thin mt-3 flex gap-3 overflow-x-auto pb-1">
        {modules.map((mod) => (
          <ModuleCard
            key={mod.id}
            mod={mod}
            isFavourite={favourites.has(mod.id)}
            onToggleFavourite={onToggleFavourite}
          />
        ))}
      </div>
    </section>
  );
}
