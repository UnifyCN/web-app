"use client";

import { use } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { LessonRow } from "@/components/learn/LessonRow";
import { useAllLessonProgresses, useModule } from "@/hooks/useLearn";

export default function ModuleDetailPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = use(params);
  const moduleQuery = useModule(moduleId);
  const progressesQuery = useAllLessonProgresses();

  const mod = moduleQuery.data;

  if (moduleQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (!mod) {
    return (
      <div className="mx-auto max-w-[860px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This module could not be found.
        </p>
        <Link
          href="/learn"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to Learn
        </Link>
      </div>
    );
  }

  const progresses = progressesQuery.data ?? {};
  const submodules = mod.submodules ?? [];
  const allLessons = submodules.flatMap((s) => s.lessons ?? []);
  const total = allLessons.length;
  const done = allLessons.filter(
    (l) => progresses[l._id]?.isCompleted,
  ).length;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;

  const accentColor = mod.colorTheme?.hex ?? "#9F9D9D";

  return (
    <div className="mx-auto max-w-[860px] px-6 py-6">
      <Breadcrumb
        items={[{ label: "Learn", href: "/learn" }, { label: mod.title }]}
      />

      <div className="mt-4 gap-6 sm:flex sm:items-center">
        <div className="flex-1">
          <h1 className="text-2xl font-bold text-ink-secondary">{mod.title}</h1>
          {mod.description && (
            <p className="mt-2 text-sm leading-relaxed text-ink-muted">
              {mod.description}
            </p>
          )}
          <p className="mt-3 text-xs font-medium text-ink-tertiary">
            Progress: {done}/{total} lessons completed
          </p>
          <div className="mt-1.5 h-2 w-full max-w-xs overflow-hidden rounded-full bg-surface-input">
            <div
              className="h-full rounded-full bg-primary"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div
          className="relative mt-4 flex aspect-[16/10] w-full items-center justify-center overflow-hidden rounded-card sm:mt-0 sm:w-64 sm:shrink-0"
          style={{ backgroundColor: accentColor }}
        >
          <span className="px-4 text-center text-xs uppercase tracking-wide text-white/80">
            {mod.title}
          </span>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {submodules.map((sub) => {
          const lessons = sub.lessons ?? [];
          return (
            <section key={sub._id}>
              <h2 className="text-lg font-bold text-ink-secondary">
                {sub.title}
              </h2>
              {sub.description && (
                <p className="mt-1 text-sm leading-relaxed text-ink-muted">
                  {sub.description}
                </p>
              )}
              <div className="mt-3 space-y-3">
                {lessons.map((lesson) => (
                  <LessonRow
                    key={lesson._id}
                    moduleId={mod._id}
                    lesson={lesson}
                    progress={progresses[lesson._id]}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}
