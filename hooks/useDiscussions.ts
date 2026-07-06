import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type InfiniteData,
} from "@tanstack/react-query";
import * as discussions from "@/services/discussions";
import { reportDiscussion, reportReply } from "@/services/moderation";
import {
  trackDiscussionPostCreated,
  trackDiscussionReplyCreated,
} from "@/lib/analytics";
import type { Discussion, DiscussionReply, DiscussionSort } from "@/types";

/**
 * React Query hooks for the In-Lesson Help discussion board. No realtime —
 * the discussion tables aren't in the realtime publication, so freshness is
 * invalidation-driven (matches the backend design). Likes are optimistic with
 * rollback; counts converge to the trigger-maintained values on refetch.
 */

const DISCUSSIONS_KEY = ["discussions"] as const;

export function discussionsKey(
  moduleId: string,
  submoduleId: string | null,
  sort: DiscussionSort,
) {
  return [...DISCUSSIONS_KEY, moduleId, submoduleId ?? "all", sort] as const;
}

export function repliesKey(discussionId: string) {
  return ["discussion-replies", discussionId] as const;
}

export function discussionStatsKey(moduleId: string) {
  return ["discussion-stats", moduleId] as const;
}

/* ---- Reads -------------------------------------------------------------- */

export function useDiscussions(
  moduleId: string,
  submoduleId: string | null,
  sort: DiscussionSort,
) {
  return useInfiniteQuery({
    queryKey: discussionsKey(moduleId, submoduleId, sort),
    queryFn: ({ pageParam }) =>
      discussions.getDiscussions(moduleId, {
        submoduleId,
        sort,
        cursor: pageParam,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled: Boolean(moduleId),
  });
}

/** Replies load lazily — `enabled` only once the thread is expanded. */
export function useDiscussionReplies(discussionId: string, enabled: boolean) {
  return useQuery({
    queryKey: repliesKey(discussionId),
    queryFn: () => discussions.getReplies(discussionId),
    enabled,
  });
}

export function useModuleDiscussionStats(moduleId: string) {
  return useQuery({
    queryKey: discussionStatsKey(moduleId),
    queryFn: () => discussions.getModuleDiscussionStats(moduleId),
    enabled: Boolean(moduleId),
    staleTime: 60_000,
  });
}

/* ---- Create / delete ----------------------------------------------------- */

export function useCreateDiscussion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: discussions.CreateDiscussionInput) =>
      discussions.createDiscussion(input),
    onSuccess: (_created, input) => {
      queryClient.invalidateQueries({
        queryKey: [...DISCUSSIONS_KEY, input.moduleId],
      });
      queryClient.invalidateQueries({
        queryKey: discussionStatsKey(input.moduleId),
      });
      trackDiscussionPostCreated({
        moduleId: input.moduleId,
        submoduleId: input.submoduleId,
        lessonId: input.lessonId,
        bodyLength: input.body.trim().length,
      });
    },
  });
}

export interface CreateReplyInput {
  discussionId: string;
  body: string;
  /** Board the thread belongs to — for cache invalidation + analytics. */
  moduleId: string;
}

export function useCreateReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ discussionId, body }: CreateReplyInput) =>
      discussions.createReply(discussionId, body),
    onSuccess: (_reply, { discussionId, moduleId, body }) => {
      queryClient.invalidateQueries({ queryKey: repliesKey(discussionId) });
      // reply_count on the thread row changes via the DB trigger.
      queryClient.invalidateQueries({
        queryKey: [...DISCUSSIONS_KEY, moduleId],
      });
      trackDiscussionReplyCreated({
        discussionId,
        moduleId,
        bodyLength: body.trim().length,
      });
    },
  });
}

export interface DeleteDiscussionInput {
  discussionId: string;
  moduleId: string;
}

export function useDeleteDiscussion() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ discussionId }: DeleteDiscussionInput) =>
      discussions.deleteDiscussion(discussionId),
    onSuccess: (_data, { moduleId }) => {
      queryClient.invalidateQueries({
        queryKey: [...DISCUSSIONS_KEY, moduleId],
      });
      queryClient.invalidateQueries({
        queryKey: discussionStatsKey(moduleId),
      });
    },
  });
}

export interface DeleteReplyInput {
  replyId: string;
  discussionId: string;
  moduleId: string;
}

export function useDeleteReply() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId }: DeleteReplyInput) =>
      discussions.deleteReply(replyId),
    onSuccess: (_data, { discussionId, moduleId }) => {
      queryClient.invalidateQueries({ queryKey: repliesKey(discussionId) });
      queryClient.invalidateQueries({
        queryKey: [...DISCUSSIONS_KEY, moduleId],
      });
    },
  });
}

/* ---- Likes (optimistic) --------------------------------------------------- */

type DiscussionPages = InfiniteData<discussions.DiscussionPage>;

/** Apply an updater to one thread across every cached page/filter variant. */
function patchDiscussionCaches(
  queryClient: ReturnType<typeof useQueryClient>,
  moduleId: string,
  discussionId: string,
  patch: (d: Discussion) => Discussion,
) {
  queryClient.setQueriesData<DiscussionPages>(
    { queryKey: [...DISCUSSIONS_KEY, moduleId] },
    (data) =>
      data && {
        ...data,
        pages: data.pages.map((page) => ({
          ...page,
          discussions: page.discussions.map((d) =>
            d.id === discussionId ? patch(d) : d,
          ),
        })),
      },
  );
}

export interface ToggleDiscussionLikeInput {
  discussionId: string;
  moduleId: string;
  /** Current like state — the mutation flips it. */
  liked: boolean;
}

export function useToggleDiscussionLike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ discussionId, liked }: ToggleDiscussionLikeInput) =>
      liked
        ? discussions.unlikeDiscussion(discussionId)
        : discussions.likeDiscussion(discussionId),
    onMutate: async ({ discussionId, moduleId, liked }) => {
      await queryClient.cancelQueries({
        queryKey: [...DISCUSSIONS_KEY, moduleId],
      });
      patchDiscussionCaches(queryClient, moduleId, discussionId, (d) => ({
        ...d,
        likedByMe: !liked,
        likeCount: Math.max(0, d.likeCount + (liked ? -1 : 1)),
      }));
    },
    onError: (_err, { discussionId, moduleId, liked }) => {
      // Roll the toggle back; the count re-converges on the next refetch.
      patchDiscussionCaches(queryClient, moduleId, discussionId, (d) => ({
        ...d,
        likedByMe: liked,
        likeCount: Math.max(0, d.likeCount + (liked ? 1 : -1)),
      }));
    },
    // Reconcile the optimistic patch with the trigger-maintained server counts.
    onSettled: (_data, _err, { moduleId }) => {
      queryClient.invalidateQueries({
        queryKey: [...DISCUSSIONS_KEY, moduleId],
      });
    },
  });
}

export interface ToggleReplyLikeInput {
  replyId: string;
  discussionId: string;
  /** Current like state — the mutation flips it. */
  liked: boolean;
}

export function useToggleReplyLike() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ replyId, liked }: ToggleReplyLikeInput) =>
      liked ? discussions.unlikeReply(replyId) : discussions.likeReply(replyId),
    onMutate: async ({ replyId, discussionId, liked }) => {
      const key = repliesKey(discussionId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<DiscussionReply[]>(key, (prev) =>
        prev?.map((r) =>
          r.id === replyId
            ? {
                ...r,
                likedByMe: !liked,
                likeCount: Math.max(0, r.likeCount + (liked ? -1 : 1)),
              }
            : r,
        ),
      );
    },
    onError: (_err, { replyId, discussionId, liked }) => {
      queryClient.setQueryData<DiscussionReply[]>(
        repliesKey(discussionId),
        (prev) =>
          prev?.map((r) =>
            r.id === replyId
              ? {
                  ...r,
                  likedByMe: liked,
                  likeCount: Math.max(0, r.likeCount + (liked ? 1 : -1)),
                }
              : r,
          ),
      );
    },
    // Reconcile the optimistic patch with the trigger-maintained server counts.
    onSettled: (_data, _err, { discussionId }) => {
      queryClient.invalidateQueries({ queryKey: repliesKey(discussionId) });
    },
  });
}

/* ---- Reports (edge fn via /api/moderation) -------------------------------- */

export function useReportDiscussion() {
  return useMutation({
    mutationFn: ({
      discussionId,
      reason,
    }: {
      discussionId: string;
      reason: string;
    }) => reportDiscussion(discussionId, reason),
  });
}

export function useReportReply() {
  return useMutation({
    mutationFn: ({ replyId, reason }: { replyId: string; reason: string }) =>
      reportReply(replyId, reason),
  });
}
