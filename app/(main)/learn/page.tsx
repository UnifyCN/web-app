"use client";

import { useState } from "react";
import { LearnHeaderDropdown } from "@/components/learn/LearnHeaderDropdown";
import { WelcomeCard } from "@/components/learn/WelcomeCard";
import { LearnSection } from "@/components/learn/LearnSection";
import { modules } from "@/lib/mock/modules";

export default function LearnPage() {
  const [favourites, setFavourites] = useState<Set<string>>(
    () => new Set(modules.filter((mod) => mod.isFavourite).map((mod) => mod.id)),
  );
  const [search, setSearch] = useState("");

  function toggleFavourite(id: string) {
    setFavourites((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }

  const query = search.trim().toLowerCase();
  const library = query
    ? modules.filter((mod) => mod.title.toLowerCase().includes(query))
    : modules;
  const inProgress = modules.filter((mod) => mod.status === "in_progress");
  const completed = modules.filter((mod) => mod.status === "completed");
  const favourite = modules.filter((mod) => favourites.has(mod.id));

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <div className="mb-5 flex justify-center">
        <LearnHeaderDropdown />
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="order-2 min-w-0 flex-1 space-y-5 lg:order-1">
          <LearnSection
            title="Lesson Library"
            modules={library}
            favourites={favourites}
            onToggleFavourite={toggleFavourite}
          />
          <LearnSection
            title="In Progress"
            modules={inProgress}
            favourites={favourites}
            onToggleFavourite={toggleFavourite}
          />
          <LearnSection
            title="Completed"
            modules={completed}
            favourites={favourites}
            onToggleFavourite={toggleFavourite}
          />
          <LearnSection
            title="Favourite"
            modules={favourite}
            favourites={favourites}
            onToggleFavourite={toggleFavourite}
          />
        </div>

        <div className="order-1 lg:order-2 lg:w-[340px] lg:shrink-0">
          <WelcomeCard search={search} onSearchChange={setSearch} />
        </div>
      </div>
    </div>
  );
}
