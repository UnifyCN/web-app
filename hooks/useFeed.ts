import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { FeedTab } from "@/types";
import * as feed from "@/services/feed";

/** React Query hooks for feed / posts data. */

const FEED_KEY = ["feed"] as const;

/* ---- Per-tab feed queries (cursor-paginated, infinite scroll) --------- */

export function useForYouFeed(enabled: boolean = true) {
  return useInfiniteQuery({
    queryKey: [...FEED_KEY, "forYou"],
    queryFn: ({ pageParam }) => feed.getForYouFeed(pageParam),
    // Keyset cursor on created_at; first page has no cursor.
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 60_000,
  });
}

export function useFollowingFeed(enabled: boolean = true) {
  return useInfiniteQuery({
    queryKey: [...FEED_KEY, "following"],
    queryFn: ({ pageParam }) => feed.getFollowingFeed(pageParam),
    // Offset-based pagination; cursor is a stringified offset.
    initialPageParam: "0",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 60_000,
  });
}

export function useGroupsFeed(enabled: boolean = true) {
  return useInfiniteQuery({
    queryKey: [...FEED_KEY, "groups"],
    queryFn: ({ pageParam }) => feed.getGroupsFeed(pageParam),
    // Offset-based pagination; cursor is a stringified offset.
    initialPageParam: "0",
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 60_000,
  });
}

/** Backwards-compatible single-hook entry point — picks the right per-tab
 *  query under the hood. Returns the flattened posts array (no cursors). */
export function useFeedPosts(tab: FeedTab = "For You") {
  const forYou = useForYouFeed(tab === "For You");
  const following = useFollowingFeed(tab === "Following");
  const groups = useGroupsFeed(tab === "Groups");

  const active =
    tab === "Following" ? following : tab === "Groups" ? groups : forYou;

  return {
    ...active,
    data: active.data?.pages.flatMap((p) => p.posts) ?? [],
  };
}

/* ---- Profile + group feeds (Supabase-wired) -------------------------- */

export function useGroupPosts(groupId: number) {
  return useQuery({
    queryKey: [...FEED_KEY, "group", groupId],
    queryFn: () => feed.getGroupPosts(groupId),
  });
}

export function useUserPosts(userId: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...FEED_KEY, "user", userId],
    queryFn: () => feed.getUserPosts(userId),
    enabled: options?.enabled ?? true,
  });
}

export function useSavedPosts() {
  return useQuery({
    queryKey: [...FEED_KEY, "saved"],
    queryFn: feed.getSavedPosts,
  });
}

export function useUserComments(
  userId: string,
  options?: { enabled?: boolean },
) {
  return useQuery({
    queryKey: [...FEED_KEY, "user-comments", userId],
    queryFn: () => feed.getUserComments(userId),
    enabled: options?.enabled ?? Boolean(userId),
  });
}

/* ---- Mutations -------------------------------------------------------- */

interface LikeInput {
  postId: number;
  /** Current like state — the mutation flips it. */
  liked: boolean;
}

export function useLikePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, liked }: LikeInput) =>
      liked ? feed.unlikePost(postId) : feed.likePost(postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

interface SaveInput {
  postId: number;
  /** Current save state — the mutation flips it. */
  saved: boolean;
}

export function useSavePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ postId, saved }: SaveInput) =>
      saved ? feed.unsavePost(postId) : feed.savePost(postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

export function useCreatePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: feed.CreatePostInput) => feed.createPost(input),
    // Refetch every tab so the new post shows up wherever it belongs.
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}

/* ---- Post detail + comments ------------------------------------------ */

const COMMENTS_KEY = ["comments"] as const;

export function usePost(postId: number) {
  return useQuery({
    queryKey: [...FEED_KEY, "post", postId],
    queryFn: () => feed.getPost(postId),
  });
}

export function useComments(postId: number) {
  return useQuery({
    queryKey: [...COMMENTS_KEY, postId],
    queryFn: () => feed.getComments(postId),
  });
}

export function useCreateComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: feed.CreateCommentInput) => feed.createComment(input),
    onSuccess: (_data, { postId }) => {
      queryClient.invalidateQueries({ queryKey: [...COMMENTS_KEY, postId] });
      // posts.comment_count changes via the DB trigger — refresh the feed
      // badge + the detail post.
      queryClient.invalidateQueries({ queryKey: FEED_KEY });
    },
  });
}

interface DeleteCommentInput {
  commentId: number;
  /** Post the comment belongs to — for cache invalidation. */
  postId: number;
}

export function useDeleteComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId }: DeleteCommentInput) =>
      feed.deleteComment(commentId),
    onSuccess: (_data, { postId }) => {
      queryClient.invalidateQueries({ queryKey: [...COMMENTS_KEY, postId] });
      queryClient.invalidateQueries({ queryKey: FEED_KEY });
    },
  });
}

interface LikeCommentInput {
  commentId: number;
  /** Post the comment belongs to — for cache invalidation. */
  postId: number;
  /** Current like state — the mutation flips it. */
  liked: boolean;
}

export function useLikeComment() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ commentId, liked }: LikeCommentInput) =>
      liked ? feed.unlikeComment(commentId) : feed.likeComment(commentId),
    onSuccess: (_data, { postId }) =>
      queryClient.invalidateQueries({ queryKey: [...COMMENTS_KEY, postId] }),
  });
}

export function useDeletePost() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (postId: number) => feed.deletePost(postId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: FEED_KEY }),
  });
}
