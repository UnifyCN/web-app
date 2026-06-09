"use client";

import { use } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Blob } from "@/components/learn/Blob";
import { Breadcrumb } from "@/components/learn/Breadcrumb";
import { FavouriteButton } from "@/components/learn/FavouriteButton";
import { ModuleIcon } from "@/components/learn/ModuleIcon";
import {
  SubmoduleTimelineRow,
  type SubmoduleState,
} from "@/components/learn/SubmoduleTimelineRow";
import {
  useAllLessonProgresses,
  useAllPracticeProgresses,
  useModule,
} from "@/hooks/useLearn";

export default function ModuleDetailPage({
  params,
}: {
  params: Promise<{ moduleId: string }>;
}) {
  const { moduleId } = use(params);
  const moduleQuery = useModule(moduleId);
  const progressesQuery = useAllLessonProgresses();
  const practiceProgressesQuery = useAllPracticeProgresses();

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
  const practiceProgresses = practiceProgressesQuery.data ?? {};
  const submodules = mod.submodules ?? [];
  const accentColor = mod.colorTheme?.hex ?? "var(--color-ink-placeholder)";

  // Per-submodule state from lesson completion. The first non-completed row
  // gets the colored CTA treatment ("primary action") and opens by default;
  // everything else renders as a neutral card with its own dot state.
  const rows = submodules.map((sub) => {
    const lessons = sub.lessons ?? [];
    const completedCount = lessons.filter(
      (l) => progresses[l._id]?.isCompleted,
    ).length;
    let state: SubmoduleState = "not_started";
    if (lessons.length > 0 && completedCount === lessons.length) {
      state = "completed";
    } else if (completedCount > 0) {
      state = "in_progress";
    }
    return { sub, lessons, completedCount, state };
  });
  const activeCTAIndex = rows.findIndex((r) => r.state !== "completed");

  return (
    <div className="mx-auto max-w-[860px] px-6 py-6">
      <Breadcrumb
        items={[{ label: "Learn", href: "/learn" }, { label: mod.title }]}
      />

      <div
        className="relative mt-4 overflow-hidden rounded-card p-6 text-white shadow-sm"
        style={{ backgroundColor: mod.colorTheme?.hex ?? "var(--color-ink-placeholder)" }}
      >
        <Blob
          color="#ffffff"
          opacity={0.22}
          className="absolute -right-16 -top-24 h-80 w-80"
        />
        <div className="relative flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <Link
              href="/learn"
              className="inline-flex items-center gap-1 text-sm text-white/90 transition-colors hover:text-white"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden />
              Back to Learn
            </Link>
            <div className="flex items-center gap-2">
              <FavouriteButton
                moduleId={mod._id}
                isFavourite={mod.isFavourite}
                className="text-white"
                size={22}
              />
              <ModuleIcon
                icon={mod.icon}
                className="h-7 w-7 text-white"
                strokeWidth={1.75}
              />
            </div>
          </div>
          <div>
            <h1 className="text-2xl font-extrabold leading-tight">
              {mod.title}
            </h1>
            {mod.description && (
              <p className="mt-2 max-w-prose text-sm leading-relaxed text-white/90">
                {mod.description}
              </p>
            )}
          </div>
        </div>
      </div>

      {submodules.length > 0 ? (
        <ol className="mt-8 flex flex-col">
          {rows.map(({ sub, lessons, completedCount, state }, i) => (
            <SubmoduleTimelineRow
              key={sub._id}
              moduleId={mod._id}
              submoduleId={sub._id}
              title={sub.title}
              lessonCount={lessons.length}
              completedCount={completedCount}
              state={state}
              isActiveCTA={i === activeCTAIndex}
              colorHex={accentColor}
              isFirst={i === 0}
              isLast={i === rows.length - 1}
              lessons={lessons}
              progresses={progresses}
              hasPractice={(sub.practice_count ?? 0) > 0}
              practiceProgress={practiceProgresses[sub._id]}
            />
          ))}
        </ol>
      ) : (
        <p className="mt-8 text-sm text-ink-muted">
          This module has no sections yet.
        </p>
      )}
    </div>
  );
}
