"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Target } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { LessonListRow } from "@/components/learn/LessonListRow";
import { PracticeQuestionList } from "@/components/learn/practice/PracticeQuestionList";
import { lessonReadMinutes } from "@/lib/learn/readTime";
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
  const { t } = useTranslation();
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
        <p className="text-sm text-ink-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (!mod || !submodule) {
    return (
      <div className="mx-auto max-w-[760px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">
          {t("learnWeb.section.notFound")}
        </p>
        <Link
          href={mod ? `/learn/${moduleId}` : "/learn"}
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {mod
            ? t("learnWeb.section.backToModule")
            : t("learnWeb.module.backToLearn")}
        </Link>
      </div>
    );
  }

  const lessons = submodule.lessons ?? [];
  const progresses = progressesQuery.data ?? {};
  const colorHex = mod.colorTheme?.hex ?? "var(--color-primary)";

  const completedCount = lessons.filter(
    (l) => progresses[l._id]?.isCompleted,
  ).length;
  const firstIncomplete = lessons.find((l) => !progresses[l._id]?.isCompleted);
  const targetLesson = firstIncomplete ?? lessons[0];
  const learnCompleted = lessons.length > 0 && !firstIncomplete;

  // --- Practice state ------------------------------------------------------
  // The card is hidden entirely when the submodule has no practice content.
  const practices = practicesQuery.data ?? [];
  const hasPractice = practices.length > 0;
  const practiceProgress = practiceProgressQuery.data;
  const practiceCompleted = !!practiceProgress?.isCompleted;
  const practiceStarted =
    !!practiceProgress &&
    ((practiceProgress.currentQuestionIndex ?? 0) > 0 ||
      Object.keys(practiceProgress.answers ?? {}).length > 0 ||
      practiceProgress.currentSubmitted);
  const practiceLabel = practiceCompleted
    ? t("common.review")
    : practiceStarted
      ? t("learnWeb.section.resume")
      : t("common.start");
  const practiceScore = practiceProgress?.score;
  const practiceTotal = practiceProgress?.totalQuestions;
  const practiceSubtitle =
    practiceCompleted && practiceScore != null && practiceTotal
      ? `${practiceScore}/${practiceTotal} · ${Math.round((practiceScore / practiceTotal) * 100)}%`
      : t("learn.submodule.practiceDescription");

  return (
    <div className="mx-auto max-w-[760px] px-6 py-8">
      <Breadcrumb
        items={[
          { label: t("tabs.learn"), href: "/learn" },
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
          {t("learnWeb.section.backTo", { title: mod.title })}
        </Link>
      </div>

      <div className="mt-6">
        <span className="inline-block rounded-full bg-surface-gray px-3 py-1 text-xs font-semibold uppercase tracking-wide text-ink-tertiary">
          {t("learn.module.section", { number: sectionNumber })}
        </span>
      </div>

      <h1 className="mt-4 text-2xl font-bold text-ink-secondary">
        {submodule.title}
      </h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-muted">
        {submodule.description ?? t("learn.submodule.defaultDescription")}
      </p>

      {/* Lesson list */}
      {lessons.length > 0 && (
        <section className="mt-8">
          {/* Primary CTA reflecting section progress */}
          {learnCompleted ? (
            <div className="flex items-center gap-3 rounded-card border border-border-card bg-surface-card p-4">
              <span
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white"
                style={{ backgroundColor: colorHex }}
              >
                <Check className="h-5 w-5" strokeWidth={3} aria-hidden />
              </span>
              <p className="text-sm font-semibold text-ink-secondary">
                {practiceCompleted || !hasPractice
                  ? t("learnWeb.section.finished")
                  : t("learnWeb.section.readyPractice")}
              </p>
            </div>
          ) : (
            <Link
              href={`/learn/${moduleId}/${submoduleId}/${targetLesson._id}`}
              className="flex items-center justify-between gap-3 rounded-card p-4 text-white shadow-sm transition-all duration-200 hover:opacity-95 active:scale-[0.99]"
              style={{ backgroundColor: colorHex }}
            >
              <div className="min-w-0">
                <p className="text-xs text-white/85">
                  {completedCount === 0
                    ? t("learnWeb.section.getStarted")
                    : t("learnWeb.section.pickUp")}
                </p>
                <p className="text-base font-bold">
                  {completedCount === 0
                    ? t("learnWeb.section.startLesson1")
                    : t("learnWeb.section.continueWhereLeft")}
                </p>
              </div>
              <ArrowRight className="h-5 w-5 shrink-0" aria-hidden />
            </Link>
          )}

          <div className="mt-5 flex items-baseline justify-between">
            <h2 className="text-sm font-bold uppercase tracking-wide text-ink-tertiary">
              {t("learnWeb.home.lessonsHeading")}
            </h2>
            <span className="text-xs text-ink-placeholder">
              {t("learnWeb.section.completeCount", {
                completed: completedCount,
                total: lessons.length,
              })}
            </span>
          </div>
          <div className="mt-2 rounded-card border border-border-card bg-surface p-1.5">
            {lessons.map((lesson) => (
              <LessonListRow
                key={lesson._id}
                href={`/learn/${moduleId}/${submoduleId}/${lesson._id}`}
                title={lesson.title}
                isCompleted={!!progresses[lesson._id]?.isCompleted}
                readMinutes={lessonReadMinutes(lesson)}
                colorHex={colorHex}
              />
            ))}
          </div>
        </section>
      )}

      {/* Practice */}
      {hasPractice && (
        <section className="mt-6">
          <Link
            href={`/learn/${moduleId}/${submoduleId}/practice`}
            className="flex items-center gap-3 rounded-card border border-border-card bg-surface p-4 transition-colors hover:bg-surface-card"
          >
            <span
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white"
              style={{ backgroundColor: colorHex }}
            >
              <Target className="h-5 w-5" strokeWidth={1.75} aria-hidden />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-sm font-bold text-ink-secondary">
                {t("learn.submodule.practiceTitle")}
              </h3>
              <p className="mt-0.5 text-xs text-ink-muted">
                {practiceSubtitle}
              </p>
            </div>
            <span
              className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold"
              style={{ color: colorHex }}
            >
              {practiceLabel}
              <ArrowRight className="h-4 w-4" aria-hidden />
            </span>
          </Link>

          <PracticeQuestionList
            practices={practices}
            practiceProgress={practiceProgress}
          />
        </section>
      )}
    </div>
  );
}
