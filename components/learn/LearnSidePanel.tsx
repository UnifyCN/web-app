"use client";

import { Compass, Search, Star } from "lucide-react";
import { cn } from "@/lib/utils";
import { weeklyMessage } from "@/lib/learn/microcopy";
import {
  RecommendedList,
  type RecommendedItem,
} from "./sidebar/RecommendedList";
import { SortControl, type SortMode } from "./sidebar/SortControl";

interface LearnSidePanelProps {
  greeting: string;
  modulesCompleted: number;
  lessonsCompleted: number;
  /** Lessons completed in the current week (Mon–Sun). */
  weeklyCompleted: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
  savedOnly: boolean;
  onSavedOnlyChange: (value: boolean) => void;
  savedCount: number;
  sortMode: SortMode;
  onSortChange: (mode: SortMode) => void;
  stageOnly: boolean;
  onStageOnlyChange: (value: boolean) => void;
  /** Whether the user has a known onboarding stage (controls the stage filter). */
  hasStage: boolean;
  recommended: RecommendedItem[];
}

export function LearnSidePanel({
  greeting,
  modulesCompleted,
  lessonsCompleted,
  weeklyCompleted,
  searchQuery,
  onSearchChange,
  savedOnly,
  onSavedOnlyChange,
  savedCount,
  sortMode,
  onSortChange,
  stageOnly,
  onStageOnlyChange,
  hasStage,
  recommended,
}: LearnSidePanelProps) {
  return (
    <div className="flex flex-col gap-4">
      <section className="rounded-card border border-border-card bg-surface p-5">
        <h2 className="text-base font-bold text-ink-secondary">
          Welcome, {greeting}
        </h2>
        <dl className="mt-3 grid grid-cols-2 gap-3">
          <div>
            <dt className="text-xs text-ink-muted">Modules completed</dt>
            <dd className="mt-0.5 text-xl font-bold text-ink-secondary">
              {modulesCompleted}
            </dd>
          </div>
          <div>
            <dt className="text-xs text-ink-muted">Lessons completed</dt>
            <dd className="mt-0.5 text-xl font-bold text-ink-secondary">
              {lessonsCompleted}
            </dd>
          </div>
        </dl>
        <div className="mt-3 rounded-md bg-primary-bg px-3 py-2">
          <p className="text-xs font-semibold text-ink-tertiary">
            {weeklyMessage(weeklyCompleted)}
          </p>
          {weeklyCompleted > 0 && (
            <p className="mt-0.5 text-[11px] text-ink-muted">
              {weeklyCompleted}{" "}
              {weeklyCompleted === 1 ? "lesson" : "lessons"} this week
            </p>
          )}
        </div>
      </section>

      <section className="rounded-card border border-border-card bg-surface p-4">
        <label className="flex items-center gap-2 rounded-md bg-surface-gray px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-ink-placeholder" aria-hidden />
          <input
            type="search"
            aria-label="Search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-base text-ink outline-none placeholder:text-ink-placeholder"
          />
        </label>

        <button
          type="button"
          onClick={() => onSavedOnlyChange(!savedOnly)}
          aria-pressed={savedOnly}
          className={cn(
            "mt-3 flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
            savedOnly
              ? "border-primary bg-primary-bg text-primary"
              : "border-border-card text-ink-muted hover:bg-surface-gray",
          )}
        >
          <Star
            className={cn("h-4 w-4", savedOnly && "fill-current")}
            aria-hidden
          />
          {savedOnly ? "Showing saved" : "Saved only"}
          {savedCount > 0 && (
            <span className={cn(!savedOnly && "text-ink-placeholder")}>
              · {savedCount}
            </span>
          )}
        </button>

        {hasStage && (
          <button
            type="button"
            onClick={() => onStageOnlyChange(!stageOnly)}
            aria-pressed={stageOnly}
            className={cn(
              "mt-2 flex w-full cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors",
              stageOnly
                ? "border-primary bg-primary-bg text-primary"
                : "border-border-card text-ink-muted hover:bg-surface-gray",
            )}
          >
            <Compass className="h-4 w-4" aria-hidden />
            {stageOnly ? "Showing my stage" : "For my stage"}
          </button>
        )}

        <div className="mt-3">
          <p className="mb-1.5 text-xs font-medium text-ink-muted">Sort by</p>
          <SortControl value={sortMode} onChange={onSortChange} />
        </div>
      </section>

      <RecommendedList items={recommended} />
    </div>
  );
}
