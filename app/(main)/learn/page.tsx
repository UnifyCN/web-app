"use client";

import { LearnHeaderDropdown } from "@/components/learn/LearnHeaderDropdown";
import { WelcomeCard } from "@/components/learn/WelcomeCard";
import { LearnSection } from "@/components/learn/LearnSection";
import { useModules, useToggleFavouriteModule } from "@/hooks/useLearn";

export default function LearnPage() {
  const modulesQuery = useModules();
  const toggleFavourite = useToggleFavouriteModule();

  const modules = modulesQuery.data ?? [];
  const inProgress = modules.filter((mod) => mod.status === "in_progress");
  const completed = modules.filter((mod) => mod.status === "completed");
  const favourite = modules.filter((mod) => mod.isFavourite);

  function handleToggleFavourite(moduleId: string, next: boolean) {
    toggleFavourite.mutate({ moduleId, isFavourite: next });
  }

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <div className="mb-5 flex justify-center">
        <LearnHeaderDropdown />
      </div>

      <div className="flex flex-col gap-5 lg:flex-row lg:items-start">
        <div className="order-2 min-w-0 flex-1 space-y-5 lg:order-1">
          <LearnSection
            title="Lesson Library"
            modules={modules}
            onToggleFavourite={handleToggleFavourite}
          />
          <LearnSection
            title="In Progress"
            modules={inProgress}
            onToggleFavourite={handleToggleFavourite}
          />
          <LearnSection
            title="Completed"
            modules={completed}
            onToggleFavourite={handleToggleFavourite}
          />
          <LearnSection
            title="Favourite"
            modules={favourite}
            onToggleFavourite={handleToggleFavourite}
          />
        </div>

        <div className="order-1 lg:order-2 lg:w-[340px] lg:shrink-0">
          <WelcomeCard />
        </div>
      </div>
    </div>
  );
}
