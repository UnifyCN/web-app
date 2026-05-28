"use client";

import { use } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { Button } from "@/components/ui/Button";
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
  const router = useRouter();

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

  function handleMarkComplete() {
    setLessonProgress.mutate(
      {
        lessonId,
        progressPercent: 100,
        isCompleted: true,
        moduleId,
      },
      {
        onSuccess: () => {
          router.push(`/learn/${moduleId}`);
        },
      },
    );
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

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant="primary"
          size="lg"
          onClick={handleMarkComplete}
          loading={setLessonProgress.isPending}
          disabled={isCompleted}
        >
          {isCompleted ? "Completed" : "Mark as complete"}
        </Button>
        <Link
          href={`/learn/${moduleId}`}
          className="inline-flex h-12 items-center justify-center gap-2 rounded-lg border border-border-card bg-surface px-6 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-gray focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
        >
          Back to module
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      </div>
    </div>
  );
}
