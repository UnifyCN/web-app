"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { LessonRow } from "@/components/learn/LessonRow";
import { SubmoduleContinueCard } from "@/components/learn/SubmoduleContinueCard";
import { useAllLessonProgresses, useModule } from "@/hooks/useLearn";

export default function SubmoduleLandingPage({
  params,
}: {
  params: Promise<{ moduleId: string; submoduleId: string }>;
}) {
  const { moduleId, submoduleId } = use(params);
  const moduleQuery = useModule(moduleId);
  const progressesQuery = useAllLessonProgresses();

  const mod = moduleQuery.data;
  const submodules = mod?.submodules ?? [];
  const submodule = submodules.find((s) => s._id === submoduleId);
  const sectionNumber =
    submodules.findIndex((s) => s._id === submoduleId) + 1 || 1;

  if (moduleQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (!mod || !submodule) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This section could not be found.
        </p>
        <Link
          href={mod ? `/learn/${moduleId}` : "/learn"}
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {mod ? "Back to module" : "Back to Learn"}
        </Link>
      </div>
    );
  }

  const lessons = submodule.lessons ?? [];
  const progresses = progressesQuery.data ?? {};
  const completedCount = lessons.filter(
    (l) => progresses[l._id]?.isCompleted,
  ).length;
  const completePercent =
    lessons.length > 0
      ? Math.round((completedCount / lessons.length) * 100)
      : 0;
  const firstIncomplete = lessons.find(
    (l) => !progresses[l._id]?.isCompleted,
  );
  const targetLesson = firstIncomplete ?? lessons[0];
  const allDone = lessons.length > 0 && !firstIncomplete;
  const colorHex = mod.colorTheme?.hex ?? "var(--color-primary)";

  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <Breadcrumb
        items={[
          { label: "Learn", href: "/learn" },
          { label: mod.title, href: `/learn/${moduleId}` },
          { label: submodule.title },
        ]}
      />

      <Link
        href={`/learn/${moduleId}`}
        className="mt-3 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {mod.title}
      </Link>

      <span className="mt-4 inline-block rounded-full bg-surface-gray px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
        Section {sectionNumber}
      </span>

      <h1 className="mt-3 text-2xl font-bold text-ink-secondary">
        {submodule.title}
      </h1>
      {submodule.description && (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {submodule.description}
        </p>
      )}

      {targetLesson && (
        <div className="mt-5">
          <SubmoduleContinueCard
            moduleId={moduleId}
            submoduleId={submoduleId}
            submoduleTitle={submodule.title}
            lessonCount={lessons.length}
            completePercent={completePercent}
            targetLessonId={targetLesson._id}
            colorHex={colorHex}
            label={allDone ? "Review" : "Continue"}
          />
        </div>
      )}

      <div className="mt-6 space-y-3">
        {lessons.map((lesson) => (
          <LessonRow
            key={lesson._id}
            moduleId={moduleId}
            submoduleId={submoduleId}
            lesson={lesson}
            progress={progresses[lesson._id]}
          />
        ))}
        {lessons.length === 0 && (
          <p className="text-sm text-ink-muted">
            No lessons in this section yet.
          </p>
        )}
      </div>
    </div>
  );
}
