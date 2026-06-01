"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, BookOpen, Target } from "lucide-react";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { SectionTimelineCard } from "@/components/learn/SectionTimelineCard";
import {
  useAllLessonProgresses,
  useModule,
  usePractices,
  usePracticeProgress,
} from "@/hooks/useLearn";
import { isSupabaseConfigured } from "@/lib/supabase/client";

export default function SubmoduleLandingPage({
  params,
}: {
  params: Promise<{ moduleId: string; submoduleId: string }>;
}) {
  const { moduleId, submoduleId } = use(params);
  const moduleQuery = useModule(moduleId);
  const progressesQuery = useAllLessonProgresses();
  const practicesQuery = usePractices(submoduleId);
  const practiceProgressQuery = usePracticeProgress(submoduleId);

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
  const colorHex = mod.colorTheme?.hex ?? "var(--color-primary)";

  // --- Learn state ---------------------------------------------------------
  const completedCount = lessons.filter(
    (l) => progresses[l._id]?.isCompleted,
  ).length;
  const firstIncomplete = lessons.find((l) => !progresses[l._id]?.isCompleted);
  const targetLesson = firstIncomplete ?? lessons[0];
  const learnCompleted = lessons.length > 0 && !firstIncomplete;
  // "Started" once any lesson has progress. In local-dev / env-not-configured
  // mode there's no progress store, so unlock Practice to keep it testable.
  const learnStarted =
    !isSupabaseConfigured() ||
    lessons.some(
      (l) =>
        progresses[l._id]?.isCompleted ||
        (progresses[l._id]?.progressPercent ?? 0) > 0,
    );
  const learnLabel = learnCompleted
    ? "Review"
    : completedCount > 0
      ? "Continue"
      : "Start";

  // --- Practice state ------------------------------------------------------
  const practices = practicesQuery.data ?? [];
  const hasQuiz = practices.some((p) => (p.questions?.length ?? 0) > 0);
  const practiceProgress = practiceProgressQuery.data;
  const practiceCompleted = !!practiceProgress?.isCompleted;
  const practiceStarted =
    !!practiceProgress && (practiceProgress.currentQuestionIndex ?? 0) > 0;
  const practiceLocked = !learnStarted || !hasQuiz;
  const practiceActive = learnCompleted && !practiceLocked && !practiceCompleted;
  const practiceLabel = practiceCompleted
    ? "Review"
    : practiceStarted
      ? "Resume"
      : "Start";
  const practiceLockedHint = !hasQuiz
    ? "No practice yet"
    : "Complete a lesson to unlock";

  return (
    <div className="mx-auto max-w-[760px] px-6 py-6">
      <Breadcrumb
        items={[
          { label: "Learn", href: "/learn" },
          { label: mod.title, href: `/learn/${moduleId}` },
          { label: submodule.title },
        ]}
      />

      <div className="mt-3">
        <Link
          href={`/learn/${moduleId}`}
          className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {mod.title}
        </Link>
      </div>

      {/* Badge on its own line, above the title (Fix 1). */}
      <div className="mt-4">
        <span className="inline-block rounded-full bg-surface-gray px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          Section {sectionNumber}
        </span>
      </div>

      <h1 className="mt-3 text-2xl font-bold text-ink-secondary">
        {submodule.title}
      </h1>
      <p className="mt-2 text-sm leading-relaxed text-ink-muted">
        {submodule.description ?? "Learn key concepts and practice your skills."}
      </p>

      {/* Activities timeline: Learn → Practice (Fix 2). */}
      <ol className="mt-6 flex flex-col">
        <SectionTimelineCard
          icon={BookOpen}
          title="Learn"
          subtitle="Key concepts & terms"
          colorHex={colorHex}
          isActive={!learnCompleted}
          dot={learnCompleted ? "completed" : "active"}
          buttonLabel={targetLesson ? learnLabel : undefined}
          href={
            targetLesson
              ? `/learn/${moduleId}/${submoduleId}/${targetLesson._id}`
              : undefined
          }
          isFirst
          isLast={false}
        />
        <SectionTimelineCard
          icon={Target}
          title="Practice"
          subtitle="Test your understanding"
          colorHex={colorHex}
          isActive={practiceActive}
          locked={practiceLocked}
          lockedHint={practiceLockedHint}
          dot={
            practiceCompleted
              ? "completed"
              : practiceLocked
                ? "locked"
                : practiceActive
                  ? "active"
                  : "todo"
          }
          buttonLabel={practiceLocked ? undefined : practiceLabel}
          href={`/learn/${moduleId}/${submoduleId}/practice`}
          isFirst={false}
          isLast
        />
      </ol>
    </div>
  );
}
