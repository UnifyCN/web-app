"use client";

import { use } from "react";
import Link from "next/link";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { LessonPager } from "@/components/learn/LessonPager";
import {
  useLesson,
  useLessonQuiz,
  useLessonQuizProgress,
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
  const setLessonProgress = useSetLessonProgress();
  const lessonQuizQuery = useLessonQuiz(lessonId);
  const lessonQuizProgressQuery = useLessonQuizProgress(lessonId);

  const mod = moduleQuery.data;
  const lesson = lessonQuery.data;
  const accentColor = mod?.colorTheme?.hex ?? "var(--color-primary)";

  // Lesson-level "Quick Check": flatten the lesson's quiz docs into one inline
  // quiz. Questions share the practice shape, so the same renderers apply.
  const lessonQuizQuestions = (lessonQuizQuery.data ?? []).flatMap(
    (q) => q.questions ?? [],
  );
  const lessonQuizTitle = lessonQuizQuery.data?.[0]?.title ?? "Quick Check";
  const lessonQuizProgress = lessonQuizProgressQuery.data;

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
  // Next lesson WITHIN this submodule. On the submodule's last lesson there's
  // no next, so "Next" returns to the section page (see nextHref) rather than
  // jumping into the next submodule.
  const nextLesson =
    lessonIndexInSubmodule >= 0 &&
    lessonIndexInSubmodule < submoduleLessons.length - 1
      ? submoduleLessons[lessonIndexInSubmodule + 1]
      : null;

  // Pressing "Next" is the completion trigger (no manual checkbox). Fired
  // before navigating; the upsert + invalidation finish in the background.
  function markComplete() {
    setLessonProgress.mutate({
      lessonId,
      progressPercent: 100,
      isCompleted: true,
      moduleId,
    });
  }

  const nextHref = nextLesson
    ? `/learn/${moduleId}/${findSubmoduleIdForLesson(nextLesson._id)}/${nextLesson._id}`
    : `/learn/${moduleId}/${submoduleId}`;

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

      {/* Keyed by lessonId so the pager's page index resets per lesson. */}
      <div className="mt-4">
        <LessonPager
          key={lessonId}
          lessonId={lessonId}
          title={lesson.title}
          description={lesson.description}
          pages={pages}
          endingPages={endingPages}
          colorHex={accentColor}
          quizTitle={lessonQuizTitle}
          quizQuestions={lessonQuizQuestions}
          quizInitialResult={
            lessonQuizProgress?.isCompleted
              ? {
                  score: lessonQuizProgress.score ?? 0,
                  total:
                    lessonQuizProgress.totalQuestions ??
                    lessonQuizQuestions.length,
                }
              : null
          }
          nextHref={nextHref}
          onLessonComplete={markComplete}
          sectionHref={`/learn/${moduleId}/${submoduleId}`}
        />
      </div>
    </div>
  );
}
