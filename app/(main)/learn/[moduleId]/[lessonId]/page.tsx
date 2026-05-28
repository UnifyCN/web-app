"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, Check, Loader2 } from "lucide-react";
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
  params: Promise<{ moduleId: string; lessonId: string }>;
}) {
  const { moduleId, lessonId } = use(params);
  const moduleQuery = useModule(moduleId);
  const lessonQuery = useLesson(lessonId);
  const progressesQuery = useAllLessonProgresses();
  const setLessonProgress = useSetLessonProgress();

  const mod = moduleQuery.data;
  const lesson = lessonQuery.data;
  const progress = progressesQuery.data?.[lessonId];
  const isCompleted = !!progress?.isCompleted;

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

  const pages = (lesson.pages ?? []).slice().sort((a, b) => a.order - b.order);
  const endingPages = (lesson.ending_pages ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

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
          ...(mod
            ? [{ label: mod.title, href: `/learn/${moduleId}` }]
            : []),
          { label: lesson.title },
        ]}
      />

      <Link
        href={`/learn/${moduleId}`}
        className="mt-3 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to module
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
    </div>
  );
}
