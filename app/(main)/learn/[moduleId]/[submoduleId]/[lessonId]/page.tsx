"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Bookmark, Check, Loader2 } from "lucide-react";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { cn } from "@/lib/utils";
import {
  useAllLessonProgresses,
  useLesson,
  useModule,
  useSetLessonProgress,
} from "@/hooks/useLearn";

export default function LessonDetailPage({
  params,
}: {
  params: Promise<{ moduleId: string; submoduleId: string; lessonId: string }>;
}) {
  const { moduleId, submoduleId, lessonId } = use(params);
  const moduleQuery = useModule(moduleId);
  const lessonQuery = useLesson(lessonId);
  const progressesQuery = useAllLessonProgresses();
  const setLessonProgress = useSetLessonProgress();

  const mod = moduleQuery.data;
  const lesson = lessonQuery.data;
  const progress = progressesQuery.data?.[lessonId];
  const isCompleted = !!progress?.isCompleted;
  const accentColor = mod?.colorTheme?.hex ?? "var(--color-primary)";

  if (lessonQuery.isLoading || moduleQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This lesson could not be found.
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

  // Flat ordered lesson list across all submodules (GROQ already orders
  // submodules + nested lessons by `order`). Drives prev/next nav below
  // and the cross-module guard.
  const submodules = mod?.submodules ?? [];
  const allLessons = submodules.flatMap((s) => s.lessons ?? []);
  const currentIndex = allLessons.findIndex((l) => l._id === lessonId);
  const parentSubmodule = submodules.find((s) =>
    (s.lessons ?? []).some((l) => l._id === lessonId),
  );

  // Module loaded but lesson isn't in this submodule (bad URL or stale
  // data). Don't render a misleading breadcrumb pointing at a parent
  // the lesson doesn't actually belong to.
  if (!mod || currentIndex === -1 || parentSubmodule?._id !== submoduleId) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          This lesson isn&rsquo;t part of this section.
        </p>
        <Link
          href={`/learn/${moduleId}`}
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to module
        </Link>
      </div>
    );
  }

  const pages = (lesson.pages ?? []).slice().sort((a, b) => a.order - b.order);
  const endingPages = (lesson.ending_pages ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  const prevLesson = currentIndex > 0 ? allLessons[currentIndex - 1] : null;
  const nextLesson =
    currentIndex >= 0 && currentIndex < allLessons.length - 1
      ? allLessons[currentIndex + 1]
      : null;

  function findSubmoduleIdForLesson(lid: string): string {
    for (const s of submodules) {
      if ((s.lessons ?? []).some((l) => l._id === lid)) return s._id;
    }
    return submoduleId;
  }

  const submoduleLessons = parentSubmodule.lessons ?? [];
  const lessonIndexInSubmodule = submoduleLessons.findIndex(
    (l) => l._id === lessonId,
  );
  const submoduleProgressPercent =
    submoduleLessons.length > 0
      ? Math.round(
          ((lessonIndexInSubmodule + 1) / submoduleLessons.length) * 100,
        )
      : 0;

  function handleToggleComplete() {
    const next = !isCompleted;
    setLessonProgress.mutate({
      lessonId,
      progressPercent: next ? 100 : 0,
      isCompleted: next,
      moduleId,
    });
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <Breadcrumb
        items={[
          { label: "Learn", href: "/learn" },
          { label: mod.title, href: `/learn/${moduleId}` },
          {
            label: parentSubmodule.title,
            href: `/learn/${moduleId}/${submoduleId}`,
          },
          { label: lesson.title },
        ]}
      />

      <div className="mt-3 flex items-center gap-3">
        <button
          type="button"
          aria-label="Bookmark lesson"
          className="cursor-pointer text-ink-muted transition-colors hover:text-primary"
        >
          <Bookmark className="h-5 w-5" aria-hidden />
        </button>
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-input">
          <div
            className="h-full rounded-full transition-[width] duration-300"
            style={{
              width: `${submoduleProgressPercent}%`,
              backgroundColor: accentColor,
            }}
          />
        </div>
      </div>

      <Link
        href={`/learn/${moduleId}/${submoduleId}`}
        className="mt-4 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to {parentSubmodule.title}
      </Link>

      <h1 className="mt-4 text-2xl font-bold text-ink-secondary">
        {lesson.title}
      </h1>
      {lesson.description && (
        <p className="mt-2 text-sm leading-relaxed text-ink-muted">
          {lesson.description}
        </p>
      )}

      {pages.map((page) => (
        <section key={page._key} className="mt-7">
          {page.title && (
            <h2 className="mb-3 text-lg font-bold text-ink-secondary">
              {page.title}
            </h2>
          )}
          <PortableTextRenderer value={page.content} />
        </section>
      ))}

      {endingPages.length > 0 && (
        <div className="mt-8 border-t border-border-card pt-6">
          {endingPages.map((page) => (
            <section key={page._key} className="mt-4 first:mt-0">
              {page.title && (
                <h2 className="mb-3 text-lg font-bold text-ink-secondary">
                  {page.title}
                </h2>
              )}
              <PortableTextRenderer value={page.content} />
            </section>
          ))}
        </div>
      )}

      <div className="mt-10 border-t border-border-card pt-6">
        <button
          type="button"
          onClick={handleToggleComplete}
          aria-pressed={isCompleted}
          disabled={setLessonProgress.isPending}
          className={cn(
            "group flex items-center gap-3",
            setLessonProgress.isPending ? "cursor-wait" : "cursor-pointer",
          )}
        >
          <span
            className={cn(
              "flex h-6 w-6 items-center justify-center rounded-md transition-colors",
              isCompleted
                ? "bg-primary text-white"
                : "border-2 border-primary",
            )}
          >
            {setLessonProgress.isPending ? (
              <Loader2
                className={cn(
                  "h-3.5 w-3.5 animate-spin",
                  isCompleted ? "text-white" : "text-ink-muted",
                )}
                aria-hidden
              />
            ) : isCompleted ? (
              <Check className="h-4 w-4" aria-hidden />
            ) : null}
          </span>
          <span
            className={cn(
              "text-sm font-semibold transition-colors",
              isCompleted
                ? "text-primary"
                : "text-ink-secondary group-hover:text-primary",
            )}
          >
            {isCompleted ? "Completed" : "Mark as complete"}
          </span>
        </button>
      </div>

      <nav className="mt-8 flex items-center justify-between gap-3">
        <div>
          {prevLesson && (
            <Link
              href={`/learn/${moduleId}/${findSubmoduleIdForLesson(prevLesson._id)}/${prevLesson._id}`}
              className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Previous lesson
            </Link>
          )}
        </div>
        <div>
          {nextLesson && (
            <Link
              href={`/learn/${moduleId}/${findSubmoduleIdForLesson(nextLesson._id)}/${nextLesson._id}`}
              className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
            >
              Next lesson
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          )}
        </div>
      </nav>
    </div>
  );
}
