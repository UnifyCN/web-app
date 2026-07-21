"use client";

import { BookOpen, ChevronRight, Sparkles, Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useModuleDiscussionStats } from "@/hooks/useDiscussions";
import { cn, RTL_FLIP } from "@/lib/utils";
import type { LessonContext } from "@/types";

/**
 * "Get help with this lesson" chooser (PRD R2) — the drawer's landing view.
 * Two paths: AI Companion (teal, instant) and Community Discussion (purple,
 * with the module's live thread count from get_module_discussion_stats).
 */
export function HelpChooser({
  lessonContext,
  onSelect,
}: {
  lessonContext: LessonContext;
  onSelect: (path: "ai" | "community") => void;
}) {
  const { t } = useTranslation();
  const statsQuery = useModuleDiscussionStats(lessonContext.moduleId);
  const discussionCount = statsQuery.data?.discussionCount ?? 0;

  return (
    <div className="px-5 py-4">
      <p className="text-sm text-ink-muted">
        {t("learnWeb.help.chooserIntro")}
      </p>

      {/* Current-lesson context chip */}
      <div className="mt-4 flex items-start gap-2 rounded-card bg-surface-gray px-3 py-2.5 text-xs text-ink-tertiary">
        <BookOpen className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
        <span className="min-w-0">
          <span className="font-medium">{t("learnWeb.help.contextLabel")} </span>
          {lessonContext.moduleTitle} › {lessonContext.submoduleTitle} ›{" "}
          {lessonContext.lessonTitle}
        </span>
      </div>

      <div className="mt-5 space-y-3">
        <button
          type="button"
          onClick={() => onSelect("ai")}
          className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border-card bg-surface p-4 text-left transition-colors hover:bg-teal-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-teal-600 text-white">
            <Sparkles className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className="text-sm font-bold text-ink-secondary">
                {t("learnWeb.help.aiTitle")}
              </span>
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-teal-700">
                {t("learnWeb.help.aiInstant")}
              </span>
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
              {t("learnWeb.help.aiDesc")}
            </span>
          </span>
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-inactive", RTL_FLIP)} aria-hidden />
        </button>

        <button
          type="button"
          onClick={() => onSelect("community")}
          className="flex w-full cursor-pointer items-center gap-3 rounded-card border border-border-card bg-surface p-4 text-left transition-colors hover:bg-purple-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-purple-600"
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-purple-600 text-white">
            <Users className="h-5 w-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="text-sm font-bold text-ink-secondary">
              {t("learnWeb.help.communityTitle")}
            </span>
            <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
              {t("learnWeb.help.communityDesc")}
            </span>
            <span className="mt-1 block text-xs font-medium text-purple-700">
              {discussionCount > 0
                ? t("learnWeb.help.discussionCountModule", {
                    count: discussionCount,
                  })
                : t("learnWeb.help.beFirstModule")}
            </span>
          </span>
          <ChevronRight className={cn("h-4 w-4 shrink-0 text-ink-inactive", RTL_FLIP)} aria-hidden />
        </button>
      </div>
    </div>
  );
}
