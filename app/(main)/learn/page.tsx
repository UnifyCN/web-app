"use client";

import { useMemo, useState } from "react";
import { LearnSidePanel } from "@/components/learn/LearnSidePanel";
import { ModuleGridCard } from "@/components/learn/ModuleGridCard";
import {
  ResumeHeroCarousel,
  type ResumeEntry,
} from "@/components/learn/ResumeHeroCarousel";
import { useAllLessonProgresses, useModules } from "@/hooks/useLearn";
import { useAuthUser } from "@/hooks/useAuthUser";
import { useCurrentUser } from "@/hooks/useProfile";
import type { LearnModuleView, ModuleStatus } from "@/types";

function matchesSearch(mod: LearnModuleView, query: string): boolean {
  if (!query) return true;
  const q = query.toLowerCase();
  if (mod.title.toLowerCase().includes(q)) return true;
  if (mod.description?.toLowerCase().includes(q)) return true;
  return false;
}

export default function LearnPage() {
  const modulesQuery = useModules();
  const progressesQuery = useAllLessonProgresses();
  const userQuery = useCurrentUser();
  const authUserQuery = useAuthUser();

  const [searchQuery, setSearchQuery] = useState("");

  const user = userQuery.data;
  const authUser = authUserQuery.data;

  // The server `status` on `learn_progress` is never written by lesson
  // completion, so we derive it client-side from the same lesson-progress
  // map the module detail page uses for its timeline rows.
  const decoratedModules = useMemo<LearnModuleView[]>(() => {
    const list = modulesQuery.data ?? [];
    const progresses = progressesQuery.data ?? {};
    return list.map((m) => {
      const lessonIds = (m.submodules ?? []).flatMap((s) =>
        (s.lessons ?? []).map((l) => l._id),
      );
      let status: ModuleStatus;
      if (lessonIds.length === 0) {
        status = "not_started";
      } else {
        const done = lessonIds.filter(
          (id) => progresses[id]?.isCompleted,
        ).length;
        if (done === 0) status = "not_started";
        else if (done === lessonIds.length) status = "completed";
        else status = "in_progress";
      }
      return { ...m, status };
    });
    // `progressesQuery.dataUpdatedAt` is intentional: it pins this memo to
    // every refetch tick of the lesson-progress cache even when React Query
    // preserves the same `data` reference across updates.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesQuery.data, progressesQuery.data, progressesQuery.dataUpdatedAt]);

  const modules = modulesQuery.data ?? [];

  const inProgressModules = decoratedModules.filter(
    (m) => m.status === "in_progress",
  );
  const notStartedModules = decoratedModules.filter(
    (m) => m.status === "not_started",
  );

  const resumeEntries = useMemo<ResumeEntry[]>(() => {
    const progresses = progressesQuery.data ?? {};
    const out: ResumeEntry[] = [];
    for (const m of inProgressModules) {
      const subs = m.submodules ?? [];
      for (let i = 0; i < subs.length; i++) {
        const lessons = subs[i].lessons ?? [];
        const firstIncomplete = lessons.find(
          (l) => !progresses[l._id]?.isCompleted,
        );
        if (firstIncomplete) {
          out.push({
            moduleId: m._id,
            submoduleId: subs[i]._id,
            lessonId: firstIncomplete._id,
            moduleTitle: m.title,
            submoduleTitle: subs[i].title,
            moduleIcon: m.icon,
            colorHex: m.colorTheme?.hex ?? "#9F9D9D",
            sectionNumber: i + 1,
            totalSections: subs.length,
          });
          break;
        }
      }
    }
    return out;
  }, [inProgressModules, progressesQuery.data]);

  const progresses = progressesQuery.data ?? {};

  const filteredInProgress = inProgressModules.filter((m) =>
    matchesSearch(m, searchQuery),
  );
  const filteredNotStarted = notStartedModules.filter((m) =>
    matchesSearch(m, searchQuery),
  );

  const fullName =
    typeof authUser?.user_metadata?.full_name === "string"
      ? authUser.user_metadata.full_name.trim()
      : "";
  const emailLocal = authUser?.email?.split("@")[0]?.trim() ?? "";
  const usernameTrimmed = user?.username?.trim() ?? "";
  const greeting = fullName || emailLocal || usernameTrimmed || "there";

  const modulesCompleted = decoratedModules.filter(
    (m) => m.status === "completed",
  ).length;
  const lessonsCompleted = Object.values(progresses).filter(
    (p) => p.isCompleted,
  ).length;

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="order-2 min-w-0 flex-1 space-y-8 lg:order-1">
          {resumeEntries.length > 0 && (
            <ResumeHeroCarousel entries={resumeEntries} />
          )}

          {filteredInProgress.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink-secondary">
                Continue Learning
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {filteredInProgress.map((mod) => (
                  <ModuleGridCard key={mod._id} mod={mod} />
                ))}
              </div>
            </section>
          )}

          {filteredNotStarted.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink-secondary">
                Recommended for You
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {filteredNotStarted.map((mod) => (
                  <ModuleGridCard key={mod._id} mod={mod} />
                ))}
              </div>
            </section>
          )}

          {modulesQuery.isLoading && modules.length === 0 && (
            <p className="text-sm text-ink-muted">Loading modules…</p>
          )}
          {!modulesQuery.isLoading &&
            filteredInProgress.length === 0 &&
            filteredNotStarted.length === 0 && (
              <p className="text-sm text-ink-muted">
                No modules match your search.
              </p>
            )}
        </div>

        <div className="order-1 lg:order-2 lg:w-[320px] lg:shrink-0">
          <LearnSidePanel
            greeting={greeting}
            modulesCompleted={modulesCompleted}
            lessonsCompleted={lessonsCompleted}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
          />
        </div>
      </div>
    </div>
  );
}
