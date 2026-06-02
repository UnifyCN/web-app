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
  const learnLabel = learnCompleted
    ? "Review"
    : completedCount > 0
      ? "Continue"
      : "Start";

  // --- Practice state ------------------------------------------------------
  // Practice is always accessible — no Learn-started gate. The card is hidden
  // entirely when the submodule has no practice content (quiz or activity).
  const practices = practicesQuery.data ?? [];
  const hasPractice = practices.length > 0;
  const practiceProgress = practiceProgressQuery.data;
  const practiceCompleted = !!practiceProgress?.isCompleted;
  const practiceStarted =
    !!practiceProgress && (practiceProgress.currentQuestionIndex ?? 0) > 0;
  const practiceActive = learnCompleted && !practiceCompleted;
  const practiceLabel = practiceCompleted
    ? "Review"
    : practiceStarted
      ? "Resume"
      : "Start";
  // Once completed, surface the score on the card (e.g. "8/10 · 80%").
  const practiceScore = practiceProgress?.score;
  const practiceTotal = practiceProgress?.totalQuestions;
  const practiceSubtitle =
    practiceCompleted && practiceScore != null && practiceTotal
      ? `${practiceScore}/${practiceTotal} · ${Math.round((practiceScore / practiceTotal) * 100)}%`
      : "Test your understanding";

  return (
    <div className="mx-auto max-w-[760px] px-6 py-8">
      <Breadcrumb
        items={[
          { label: "Learn", href: "/learn" },
          { label: mod.title, href: `/learn/${moduleId}` },
          { label: submodule.title },
        ]}
      />

      <div className="mt-5">
        <Link
          href={`/learn/${moduleId}`}
          className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          Back to {mod.title}
        </Link>
      </div>

      {/* Badge on its own line, above the title (Fix 1). */}
      <div className="mt-6">
        <span className="inline-block rounded-full bg-surface-gray px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          Section {sectionNumber}
        </span>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-ink-secondary">
        {submodule.title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
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
          isLast={!hasPractice}
        />
        {hasPractice && (
          <SectionTimelineCard
            icon={Target}
            title="Practice"
            subtitle={practiceSubtitle}
            colorHex={colorHex}
            isActive={practiceActive}
            dot={
              practiceCompleted
                ? "completed"
                : practiceActive
                  ? "active"
                  : "todo"
            }
            buttonLabel={practiceLabel}
            href={`/learn/${moduleId}/${submoduleId}/practice`}
            isFirst={false}
            isLast
          />
        )}
      </ol>
    </div>
  );
}
