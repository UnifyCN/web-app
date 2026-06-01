"use client";

import { use, useMemo } from "react";
import Link from "next/link";
import {
  useModule,
  usePractices,
  usePracticeProgress,
} from "@/hooks/useLearn";
import { PracticeQuiz } from "@/components/learn/practice/PracticeQuiz";
import { flattenPractices } from "@/components/learn/practice/flattenPractices";

export default function PracticePage({
  params,
}: {
  params: Promise<{ moduleId: string; submoduleId: string }>;
}) {
  const { moduleId, submoduleId } = use(params);
  const moduleQuery = useModule(moduleId);
  const practicesQuery = usePractices(submoduleId);
  const progressQuery = usePracticeProgress(submoduleId);

  const mod = moduleQuery.data;
  const submodules = mod?.submodules ?? [];
  const submodule = submodules.find((s) => s._id === submoduleId);
  const sectionNumber =
    submodules.findIndex((s) => s._id === submoduleId) + 1 || 1;
  const colorHex = mod?.colorTheme?.hex ?? "var(--color-primary)";

  // Flatten the section's activity practices into one ordered question list,
  // remembering each question's heading (page/practice title).
  const flat = useMemo(
    () => flattenPractices(practicesQuery.data ?? []),
    [practicesQuery.data],
  );

  if (
    moduleQuery.isLoading ||
    practicesQuery.isLoading ||
    progressQuery.isLoading
  ) {
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

  return (
    <PracticeQuiz
      moduleId={moduleId}
      submoduleId={submoduleId}
      sectionNumber={sectionNumber}
      submoduleTitle={submodule.title}
      colorHex={colorHex}
      questions={flat}
      initialProgress={progressQuery.data ?? null}
    />
  );
}
