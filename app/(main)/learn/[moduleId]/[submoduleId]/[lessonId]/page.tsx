"use client";

import { LessonReaderV2 } from "@/components/learn/v2/LessonReaderV2";
import { isLearnV2Enabled } from "@/lib/learn/v2/flag";
import { Suspense, use } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { LessonPager } from "@/components/learn/LessonPager";
import { useToast } from "@/components/ui/ToastProvider";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import {
  useLesson,
  useLessonQuiz,
  useModule,
  useSetLessonProgress,
} from "@/hooks/useLearn";
import { trackLessonCompleted } from "@/lib/analytics";

function LessonDetailPageV1({
  params,
}: {
  params: Promise<{ moduleId: string; submoduleId: string; lessonId: string }>;
}) {
  const { moduleId, submoduleId, lessonId } = use(params);
  const { t } = useTranslation();
  const moduleQuery = useModule(moduleId);
  const lessonQuery = useLesson(lessonId);
  const setLessonProgress = useSetLessonProgress();
  const lessonQuizQuery = useLessonQuiz(lessonId);
  const toast = useToast();
  const searchParams = useSearchParams();
  const highlightQuery = searchParams.get("highlight") ?? undefined;

  const mod = moduleQuery.data;
  const lesson = lessonQuery.data;
  const accentColor = mod?.colorTheme?.hex ?? "var(--color-primary)";

  // Lesson-level "Quick Check": flatten the lesson's quiz docs into one inline
  // quiz. Questions share the practice shape, so the same renderers apply.
  const lessonQuizQuestions = (lessonQuizQuery.data ?? []).flatMap(
    (q) => q.questions ?? [],
  );
  const lessonQuizTitle =
    lessonQuizQuery.data?.[0]?.title ?? t("learnWeb.lesson.quickCheck");

  if (
    lessonQuery.isLoading ||
    moduleQuery.isLoading ||
    lessonQuizQuery.isLoading
  ) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="loading-delayed text-sm text-ink-muted">
          {t("common.loading")}
        </p>
      </div>
    );
  }

  if (!lesson) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          {t("learnWeb.lesson.notFound")}
        </p>
        <Link
          href="/learn"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {t("learnWeb.module.backToLearn")}
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
          {t("learnWeb.lesson.notInSection")}
        </p>
        <Link
          href={`/learn/${moduleId}`}
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {t("learnWeb.section.backToModule")}
        </Link>
      </div>
    );
  }

  const pages = (lesson.pages ?? []).slice().sort((a, b) => a.order - b.order);
  const endingPages = (lesson.ending_pages ?? [])
    .slice()
    .sort((a, b) => a.order - b.order);

  // Module-level position for encouraging banners + the "next up" suggestion.
  const isFirstLesson = currentIndex === 0;
  const isLastLesson = currentIndex === allLessons.length - 1;
  const nextLessonObj = allLessons[currentIndex + 1];
  const nextLessonSub = nextLessonObj
    ? submodules.find((s) =>
        (s.lessons ?? []).some((l) => l._id === nextLessonObj._id),
      )
    : undefined;
  const nextLesson =
    nextLessonObj && nextLessonSub
      ? {
          title: nextLessonObj.title,
          href: `/learn/${moduleId}/${nextLessonSub._id}/${nextLessonObj._id}`,
        }
      : undefined;

  // Finishing a lesson marks it complete (no manual checkbox); the upsert +
  // invalidation run in the background. Per product spec, finishing always
  // returns to the section page — there's no auto-advance to the next lesson.
  function markComplete() {
    setLessonProgress.mutate(
      {
        lessonId,
        submoduleId,
        moduleId,
        progressPercent: 100,
        isCompleted: true,
      },
      {
        onSuccess: () => {
          // Only confirm when a write actually happened (the mock/no-Supabase
          // path resolves "successfully" without persisting anything).
          if (isSupabaseConfigured())
            toast.success(t("learnWeb.lesson.completeToast"));
          trackLessonCompleted({ lessonId, submoduleId, moduleId });
        },
      },
    );
  }

  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <Breadcrumb
        items={[
          { label: t("tabs.learn"), href: "/learn" },
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
          onLessonComplete={markComplete}
          sectionHref={`/learn/${moduleId}/${submoduleId}`}
          moduleId={moduleId}
          submoduleId={submoduleId}
          submoduleTitle={parentSubmodule.title}
          highlightQuery={highlightQuery}
          moduleTitle={mod.title}
          isFirstLesson={isFirstLesson}
          isLastLesson={isLastLesson}
          nextLesson={nextLesson}
        />
      </div>
    </div>
  );
}

/** Learn v2 (Courses redesign) behind the build-time flag; with the flag off
 * the page above is unchanged. */
export default function LessonDetailPage(props: {
  params: Promise<{ moduleId: string; submoduleId: string; lessonId: string }>;
}) {
  const { moduleId, submoduleId, lessonId } = use(props.params);
  if (isLearnV2Enabled()) {
    // The reader reads `?step=` with useSearchParams, which needs Suspense.
    return (
      <Suspense>
        <LessonReaderV2
          courseId={moduleId}
          moduleId={submoduleId}
          lessonId={lessonId}
        />
      </Suspense>
    );
  }
  return <LessonDetailPageV1 params={props.params} />;
}
