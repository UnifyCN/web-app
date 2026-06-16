"use client";

import { Suspense, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { LearnSidePanel } from "@/components/learn/LearnSidePanel";
import { LessonSearchResult } from "@/components/learn/LessonSearchResult";
import { ModuleGridCard } from "@/components/learn/ModuleGridCard";
import { StartHereCard } from "@/components/learn/StartHereCard";
import type { SortMode } from "@/components/learn/sidebar/SortControl";
import type { RecommendedItem } from "@/components/learn/sidebar/RecommendedList";
import {
  ResumeHeroCarousel,
  type ResumeEntry,
} from "@/components/learn/ResumeHeroCarousel";
import { useAllLessonProgresses, useModules } from "@/hooks/useLearn";
import { useCurrentUser } from "@/hooks/useProfile";
import {
  matchesStage,
  scoreModule,
  whyTag,
  type RecommendProfile,
} from "@/lib/learn/recommend";
import { escapeRegExp } from "@/lib/utils";
import type { LearnModuleView, ModuleStatus } from "@/types";

/**
 * Whole-word, case-insensitive matcher. Word boundaries stop short queries like
 * "SIN" from matching substrings ("lea**sin**g", "licen**sin**g").
 */
function buildWordMatcher(query: string): RegExp {
  return new RegExp(`\\b${escapeRegExp(query)}\\b`, "i");
}

function matchesSearch(mod: LearnModuleView, re: RegExp): boolean {
  if (re.test(mod.title)) return true;
  if (mod.description && re.test(mod.description)) return true;
  return false;
}

/** Start of the current week (Monday 00:00, local time) as an epoch ms. */
function startOfWeekMs(): number {
  const now = new Date();
  const daysSinceMonday = (now.getDay() + 6) % 7; // Sun=0 -> 6, Mon=1 -> 0
  const monday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate() - daysSinceMonday,
  );
  return monday.getTime();
}

function sortModules(
  list: LearnModuleView[],
  mode: SortMode,
  profile: RecommendProfile,
): LearnModuleView[] {
  const copy = [...list];
  if (mode === "az") {
    copy.sort((a, b) => a.title.localeCompare(b.title));
  } else if (mode === "newest") {
    copy.sort((a, b) => (b._createdAt ?? "").localeCompare(a._createdAt ?? ""));
  } else {
    copy.sort((a, b) => {
      const diff = scoreModule(b, profile) - scoreModule(a, profile);
      return diff !== 0 ? diff : a.title.localeCompare(b.title);
    });
  }
  return copy;
}

interface LessonHit {
  lessonId: string;
  lessonTitle: string;
  submoduleId: string;
  submoduleTitle: string;
  moduleId: string;
  moduleTitle: string;
  colorHex: string;
}

function LearnPageContent() {
  const modulesQuery = useModules();
  const progressesQuery = useAllLessonProgresses();
  const userQuery = useCurrentUser();

  const [searchQuery, setSearchQuery] = useState("");
  const [savedOnly, setSavedOnly] = useState(false);
  const [stageOnly, setStageOnly] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>("relevant");

  // Dev/preview override: /learn?startHere=1 forces the Start-here card on.
  const searchParams = useSearchParams();
  const forceStartHere = searchParams.get("startHere") === "1";

  const user = userQuery.data;
  const stage = user?.onboarding?.stage ?? null;
  const profile: RecommendProfile = useMemo(
    () => ({
      persona: user?.onboarding?.persona ?? null,
      learningInterests: user?.onboarding?.learningInterests ?? [],
      stage,
    }),
    [user?.onboarding?.persona, user?.onboarding?.learningInterests, stage],
  );

  // The server `status` on `learn_progress` is never written by lesson
  // completion, so we derive it client-side from the same lesson-progress
  // map the module detail page uses.
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
    // `progressesQuery.dataUpdatedAt` pins this memo to every refetch tick.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modulesQuery.data, progressesQuery.data, progressesQuery.dataUpdatedAt]);

  const modules = modulesQuery.data ?? [];
  // Stable reference so the memos that depend on it don't re-run every render.
  const progresses = useMemo(
    () => progressesQuery.data ?? {},
    [progressesQuery.data],
  );
  const query = searchQuery.trim();
  const isSearching = query.length > 0;

  const { inProgressModules, exploreModules } = useMemo(() => {
    const passes = (m: LearnModuleView) =>
      (!savedOnly || m.isFavourite) && (!stageOnly || matchesStage(m, stage));
    return {
      inProgressModules: sortModules(
        decoratedModules.filter((m) => m.status === "in_progress" && passes(m)),
        sortMode,
        profile,
      ),
      exploreModules: sortModules(
        decoratedModules.filter((m) => m.status !== "in_progress" && passes(m)),
        sortMode,
        profile,
      ),
    };
  }, [decoratedModules, savedOnly, stageOnly, stage, sortMode, profile]);

  // --- Resume hero (first incomplete lesson of each in-progress module) ----
  const resumeEntries = useMemo<ResumeEntry[]>(() => {
    const out: ResumeEntry[] = [];
    for (const m of decoratedModules.filter((x) => x.status === "in_progress")) {
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
            colorHex: m.colorTheme?.hex ?? "var(--color-ink-placeholder)",
            sectionNumber: i + 1,
            totalSections: subs.length,
            isFavourite: m.isFavourite,
          });
          break;
        }
      }
    }
    return out;
  }, [decoratedModules, progresses]);

  // --- Search: flatten the module tree into module + lesson hits -----------
  // Memoized so the triple-loop flatten only runs when the query/filters change,
  // not on every render. The whole-word matcher has no `g` flag, so reusing
  // `.test()` across items keeps no lastIndex state.
  const { moduleHits, lessonHits } = useMemo(() => {
    const wordRe = isSearching ? buildWordMatcher(query) : null;
    if (!wordRe) return { moduleHits: [] as LearnModuleView[], lessonHits: [] as LessonHit[] };
    // Search within the same set the sidebar filters apply to.
    const pool = decoratedModules.filter(
      (m) =>
        (!savedOnly || m.isFavourite) && (!stageOnly || matchesStage(m, stage)),
    );
    const mHits = pool.filter((m) => matchesSearch(m, wordRe));
    const lHits: LessonHit[] = [];
    for (const m of pool) {
      const colorHex = m.colorTheme?.hex ?? "var(--color-ink-placeholder)";
      for (const sub of m.submodules ?? []) {
        for (const lesson of sub.lessons ?? []) {
          if (wordRe.test(lesson.title)) {
            lHits.push({
              lessonId: lesson._id,
              lessonTitle: lesson.title,
              submoduleId: sub._id,
              submoduleTitle: sub.title,
              moduleId: m._id,
              moduleTitle: m.title,
              colorHex,
            });
          }
        }
      }
    }
    return { moduleHits: mHits, lessonHits: lHits };
  }, [decoratedModules, savedOnly, stageOnly, stage, query, isSearching]);

  // --- Sidebar derived values ----------------------------------------------
  const firstName = user?.onboarding?.firstName?.trim();
  const username = user?.username?.trim();
  const greeting = firstName || (username ? `@${username}` : "there");
  const savedCount = decoratedModules.filter((m) => m.isFavourite).length;
  const modulesCompleted = decoratedModules.filter(
    (m) => m.status === "completed",
  ).length;
  const lessonsCompleted = Object.values(progresses).filter(
    (p) => p.isCompleted,
  ).length;

  const weekStart = startOfWeekMs();
  const weeklyCompleted = Object.values(progresses).filter(
    (p) => p.isCompleted && new Date(p.updatedAt).getTime() >= weekStart,
  ).length;

  const recommended: RecommendedItem[] = useMemo(() => {
    return decoratedModules
      .map((m) => ({ module: m, score: scoreModule(m, profile) }))
      .filter((r) => r.score > 0)
      .sort(
        (a, b) =>
          b.score - a.score || a.module.title.localeCompare(b.module.title),
      )
      .slice(0, 3)
      .map((r) => ({ module: r.module, why: whyTag(r.module, profile) }));
  }, [decoratedModules, profile]);

  // --- Start-here (first-time, no progress at all) -------------------------
  // Show when the user has neither completed nor in-progress lessons. The
  // `?startHere=1` param forces it on for previewing without clearing progress.
  const anyCompleted = Object.values(progresses).some((p) => p.isCompleted);
  const anyInProgress = Object.values(progresses).some(
    (p) => !p.isCompleted && p.progressPercent > 0,
  );
  const hasNoProgress = !anyCompleted && !anyInProgress;
  const showStartHere =
    (hasNoProgress || forceStartHere) && decoratedModules.length > 0;
  const startHere = useMemo(() => {
    if (!showStartHere) return undefined;
    const ranked = [...decoratedModules].sort(
      (a, b) =>
        scoreModule(b, profile) - scoreModule(a, profile) ||
        a.title.localeCompare(b.title),
    );
    return ranked[0];
  }, [showStartHere, decoratedModules, profile]);

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        <div className="order-2 min-w-0 flex-1 animate-fade-in space-y-8 lg:order-1">
          {/* Search results (when searching), then "Browse all modules". */}
          {isSearching && (
            <>
              {moduleHits.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-ink-secondary">
                    Modules
                  </h2>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {moduleHits.map((mod) => (
                      <ModuleGridCard key={mod._id} mod={mod} />
                    ))}
                  </div>
                </section>
              )}
              {lessonHits.length > 0 && (
                <section>
                  <h2 className="text-lg font-bold text-ink-secondary">
                    Lessons
                  </h2>
                  <div className="mt-3 space-y-2">
                    {lessonHits.map((hit) => (
                      <LessonSearchResult
                        key={hit.lessonId}
                        href={`/learn/${hit.moduleId}/${hit.submoduleId}/${hit.lessonId}?highlight=${encodeURIComponent(query)}`}
                        lessonTitle={hit.lessonTitle}
                        submoduleTitle={hit.submoduleTitle}
                        moduleTitle={hit.moduleTitle}
                        colorHex={hit.colorHex}
                      />
                    ))}
                  </div>
                </section>
              )}
              {moduleHits.length === 0 && lessonHits.length === 0 && (
                <p className="text-sm text-ink-muted">
                  No modules or lessons match “{query}”.
                </p>
              )}
              <div className="flex items-center gap-3">
                <span className="h-px flex-1 bg-border-card" />
                <span className="text-xs font-semibold uppercase tracking-wide text-ink-placeholder">
                  Browse all modules
                </span>
                <span className="h-px flex-1 bg-border-card" />
              </div>
            </>
          )}

          {/* Start-here + resume are only shown when not searching. */}
          {!isSearching && startHere && (
            <StartHereCard
              moduleId={startHere._id}
              moduleTitle={startHere.title}
              reason={whyTag(startHere, profile) || undefined}
              colorHex={startHere.colorTheme?.hex ?? "var(--color-ink-placeholder)"}
            />
          )}

          {!isSearching && resumeEntries.length > 0 && (
            <ResumeHeroCarousel entries={resumeEntries} />
          )}

          {inProgressModules.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink-secondary">
                Continue Learning
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {inProgressModules.map((mod) => (
                  <ModuleGridCard key={mod._id} mod={mod} />
                ))}
              </div>
            </section>
          )}

          {exploreModules.length > 0 && (
            <section>
              <h2 className="text-lg font-bold text-ink-secondary">
                Explore Modules
              </h2>
              <div className="mt-3 grid grid-cols-2 gap-3">
                {exploreModules.map((mod) => (
                  <ModuleGridCard key={mod._id} mod={mod} />
                ))}
              </div>
            </section>
          )}

          {modulesQuery.isLoading && modules.length === 0 && (
            <section className="animate-pulse" aria-hidden>
              <div className="h-6 w-44 rounded bg-surface-gray" />
              <div className="mt-3 grid grid-cols-2 gap-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="aspect-[5/4] rounded-card bg-surface-gray shadow-sm"
                  />
                ))}
              </div>
            </section>
          )}
          {!modulesQuery.isLoading &&
            inProgressModules.length === 0 &&
            exploreModules.length === 0 && (
              <p className="text-sm text-ink-muted">
                {savedOnly
                  ? "No saved modules yet — tap the star on a module to save it."
                  : stageOnly
                    ? "No modules match your current stage filter."
                    : "No modules available yet."}
              </p>
            )}
        </div>

        <div className="order-1 scrollbar-thin lg:order-2 lg:w-[320px] lg:shrink-0 lg:sticky lg:top-6 lg:self-start lg:max-h-[calc(100vh-3rem)] lg:overflow-y-auto">
          <LearnSidePanel
            greeting={greeting}
            modulesCompleted={modulesCompleted}
            lessonsCompleted={lessonsCompleted}
            weeklyCompleted={weeklyCompleted}
            searchQuery={searchQuery}
            onSearchChange={setSearchQuery}
            savedOnly={savedOnly}
            onSavedOnlyChange={setSavedOnly}
            savedCount={savedCount}
            sortMode={sortMode}
            onSortChange={setSortMode}
            stageOnly={stageOnly}
            onStageOnlyChange={setStageOnly}
            hasStage={!!user?.onboarding}
            recommended={recommended}
          />
        </div>
      </div>
    </div>
  );
}

// useSearchParams() forces a client-side-rendering bailout, which Next requires
// be wrapped in a Suspense boundary or `next build` fails prerendering /learn.
export default function LearnPage() {
  return (
    <Suspense>
      <LearnPageContent />
    </Suspense>
  );
}
