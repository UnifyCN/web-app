"use client";

import { useMemo, useState } from "react";
import { Users } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useModule } from "@/hooks/useLearn";
import { useCurrentUser } from "@/hooks/useProfile";
import {
  useCreateDiscussion,
  useDiscussions,
  useModuleDiscussionStats,
} from "@/hooks/useDiscussions";
import { DiscussionThreadCard } from "./DiscussionThreadCard";
import { DiscussionComposer } from "./DiscussionComposer";
import { cn } from "@/lib/utils";
import type { DiscussionSort, LessonContext } from "@/types";

/**
 * Module-scoped discussion board (PRD R4) — the drawer's community path.
 * Opens pre-filtered to the lesson's submodule with chips to widen/switch,
 * Recent|Top sort, lazily-expanded threads, and a pinned composer. New
 * questions are tagged with the module/submodule/lesson they were asked from
 * (origin, not the active filter). Freshness is invalidation-driven — the
 * discussion tables aren't in the realtime publication.
 */
export function DiscussionBoard({
  lessonContext,
}: {
  lessonContext: LessonContext;
}) {
  const { t } = useTranslation();
  const { moduleId } = lessonContext;
  const [submoduleFilter, setSubmoduleFilter] = useState<string | null>(
    lessonContext.submoduleId,
  );
  const [sort, setSort] = useState<DiscussionSort>("recent");
  const [postError, setPostError] = useState<string | null>(null);

  const moduleQuery = useModule(moduleId);
  const statsQuery = useModuleDiscussionStats(moduleId);
  const discussionsQuery = useDiscussions(moduleId, submoduleFilter, sort);
  const createDiscussion = useCreateDiscussion();
  const currentUserId = useCurrentUser().data?.id;

  const submodules = useMemo(
    () =>
      (moduleQuery.data?.submodules ?? []).map((s) => ({
        id: s._id,
        title: s.title,
      })),
    [moduleQuery.data],
  );
  const submoduleTitleById = useMemo(
    () => new Map(submodules.map((s) => [s.id, s.title])),
    [submodules],
  );

  const discussions =
    discussionsQuery.data?.pages.flatMap((page) => page.discussions) ?? [];
  const stats = statsQuery.data;

  async function submitQuestion(body: string) {
    setPostError(null);
    try {
      await createDiscussion.mutateAsync({
        moduleId,
        // Origin tags — where the user was reading, not the active filter.
        submoduleId: lessonContext.submoduleId || null,
        lessonId: lessonContext.lessonId || null,
        body,
      });
    } catch (err) {
      setPostError(
        err instanceof Error
          ? err.message
          : t("learnWeb.discussion.postFailed"),
      );
      throw err; // keep the draft in the composer
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {/* Stats subheader */}
      <div className="flex items-center gap-2 border-b border-border-card px-5 py-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-purple-600 text-white">
          <Users className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-bold text-ink-secondary">
            {t("learnWeb.discussion.headerTitle", {
              module: lessonContext.moduleTitle,
            })}
          </p>
          <p className="text-xs text-ink-placeholder">
            {statsQuery.isError
              ? t("learnWeb.discussion.statsFailed")
              : stats
                ? `${t("learnWeb.discussion.discussionCount", { count: stats.discussionCount })} · ${t("learnWeb.discussion.participantCount", { count: stats.participantCount })}`
                : t("common.loading")}
          </p>
        </div>
        {/* Sort toggle */}
        <div
          className="ms-auto flex shrink-0 rounded-full bg-surface-gray p-0.5"
          role="group"
          aria-label={t("learnWeb.discussion.sortAria")}
        >
          {(["recent", "top"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSort(value)}
              aria-pressed={sort === value}
              className={cn(
                "cursor-pointer rounded-full px-2.5 py-1 text-xs font-medium transition-colors",
                sort === value
                  ? "bg-surface text-ink-secondary shadow-sm"
                  : "text-ink-muted hover:text-ink",
              )}
            >
              {t(`learnWeb.discussion.sort.${value}`)}
            </button>
          ))}
        </div>
      </div>

      {/* Submodule filter chips (or an inline note if the module failed to load) */}
      {moduleQuery.isError ? (
        <div className="border-b border-border-card px-5 py-2.5 text-xs text-ink-placeholder">
          {t("learnWeb.discussion.sectionsFailed")}
        </div>
      ) : submodules.length > 0 ? (
        <div className="scrollbar-thin flex gap-2 overflow-x-auto border-b border-border-card px-5 py-2.5">
          <button
            type="button"
            onClick={() => setSubmoduleFilter(null)}
            aria-pressed={submoduleFilter === null}
            className={cn(
              "shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
              submoduleFilter === null
                ? "bg-purple-600 text-white"
                : "bg-surface-gray text-ink-muted hover:text-ink",
            )}
          >
            {t("learnWeb.discussion.filterAll")}
          </button>
          {submodules.map((submodule) => (
            <button
              key={submodule.id}
              type="button"
              onClick={() => setSubmoduleFilter(submodule.id)}
              aria-pressed={submoduleFilter === submodule.id}
              className={cn(
                "shrink-0 cursor-pointer rounded-full px-3 py-1 text-xs font-medium transition-colors",
                submoduleFilter === submodule.id
                  ? "bg-purple-600 text-white"
                  : "bg-surface-gray text-ink-muted hover:text-ink",
              )}
            >
              {submodule.title}
            </button>
          ))}
        </div>
      ) : null}

      {/* Thread list */}
      <div className="scrollbar-thin min-h-0 flex-1 space-y-3 overflow-y-auto px-5 py-4">
        {discussionsQuery.isError ? (
          // A failed load must not fall through to the "Be the first to ask"
          // empty state — surface the error with a retry.
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-ink-secondary">
              {t("learnWeb.discussion.loadFailed")}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {t("common.errorGeneric")}
            </p>
            <button
              type="button"
              onClick={() => discussionsQuery.refetch()}
              className="mt-3 cursor-pointer rounded-full bg-purple-600 px-4 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-purple-700"
            >
              {t("common.retry")}
            </button>
          </div>
        ) : discussionsQuery.isLoading ? (
          // Skeletons while the first page loads
          <>
            {[0, 1, 2].map((index) => (
              <div
                key={index}
                className="animate-pulse rounded-card border border-border-card bg-surface-card p-4"
              >
                <div className="h-3 w-1/3 rounded bg-surface-input" />
                <div className="mt-3 h-3 w-full rounded bg-surface-input" />
                <div className="mt-2 h-3 w-2/3 rounded bg-surface-input" />
              </div>
            ))}
          </>
        ) : discussions.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-sm font-semibold text-ink-secondary">
              {t("learnWeb.discussion.beFirst")}
            </p>
            <p className="mt-1 text-xs text-ink-muted">
              {t("learnWeb.discussion.beFirstHint")}
            </p>
          </div>
        ) : (
          <>
            {discussions.map((discussion) => (
              <DiscussionThreadCard
                key={discussion.id}
                discussion={discussion}
                moduleId={moduleId}
                submoduleTitle={
                  discussion.submoduleId
                    ? (submoduleTitleById.get(discussion.submoduleId) ?? null)
                    : null
                }
                currentUserId={currentUserId}
              />
            ))}
            {discussionsQuery.hasNextPage && (
              <button
                type="button"
                onClick={() => discussionsQuery.fetchNextPage()}
                disabled={discussionsQuery.isFetchingNextPage}
                className="w-full cursor-pointer rounded-card border border-border-card py-2 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-gray disabled:cursor-not-allowed"
              >
                {discussionsQuery.isFetchingNextPage
                  ? t("common.loading")
                  : t("learnWeb.discussion.loadMore")}
              </button>
            )}
          </>
        )}
      </div>

      {/* New-question composer */}
      <div className="border-t border-border-card px-5 py-3">
        <DiscussionComposer
          placeholder={t("learnWeb.discussion.askCommunityPlaceholder", {
            module: lessonContext.moduleTitle,
          })}
          isPending={createDiscussion.isPending}
          onSubmit={submitQuestion}
          errorMessage={postError}
        />
      </div>
    </div>
  );
}
