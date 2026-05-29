"use client";

import { Search } from "lucide-react";

interface LearnSidePanelProps {
  greeting: string;
  modulesCompleted: number;
  lessonsCompleted: number;
  searchQuery: string;
  onSearchChange: (value: string) => void;
}

export function LearnSidePanel({
  greeting,
  modulesCompleted,
  lessonsCompleted,
  searchQuery,
  onSearchChange,
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
      </section>

      <section className="rounded-card border border-border-card bg-surface p-4">
        <label className="flex items-center gap-2 rounded-md bg-surface-gray px-3 py-2 text-sm">
          <Search className="h-4 w-4 text-ink-placeholder" aria-hidden />
          <input
            type="search"
            placeholder="Search modules"
            value={searchQuery}
            onChange={(e) => onSearchChange(e.target.value)}
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-ink-placeholder"
          />
        </label>
      </section>
    </div>
  );
}
