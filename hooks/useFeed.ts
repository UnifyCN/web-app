import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { FeedTab } from "@/types";
import * as feed from "@/services/feed";

/** React Query hooks for feed / posts data. */

const FEED_KEY = ["feed"] as const;

/* ---- Per-tab feed queries (first-page-only) --------------------------- */

export function useForYouFeed(enabled: boolean = true) {
  return useQuery({
    queryKey: [...FEED_KEY, "forYou"],
    queryFn: () => feed.getForYouFeed(),
    enabled,
  });
}

export function useFollowingFeed(enabled: boolean = true) {
  return useQuery({
    queryKey: [...FEED_KEY, "following"],
    queryFn: () => feed.getFollowingFeed(),
    enabled,
  });
}

export function useGroupsFeed(enabled: boolean = true) {
  return useQuery({
    queryKey: [...FEED_KEY, "groups"],
    queryFn: () => feed.getGroupsFeed(),
    enabled,
  });
}

/** Backwards-compatible single-hook entry point — picks the right per-tab
 *  query under the hood. Returns just the posts array (no nextCursor). */
export function useFeedPosts(tab: FeedTab = "For You") {
  const forYou = useForYouFeed(tab === "For You");
  const following = useFollowingFeed(tab === "Following");
  const groups = useGroupsFeed(tab === "Groups");

  const active =
    tab === "Following" ? following : tab === "Groups" ? groups : forYou;

  return {
    ...active,
    data: active.data?.posts,
  };
}

/* ---- Unwired mock-only hooks ----------------------------------------- */

export function useGroupPosts(groupId: number) {
  return useQuery({
    queryKey: [...FEED_KEY, "group", groupId],
    queryFn: () => feed.getGroupPosts(groupId),
  });
}

export function useUserPosts(userId: string) {
  return useQuery({
    queryKey: [...FEED_KEY, "user", userId],
    queryFn: () => feed.getUserPosts(userId),
  });
}

export function useSavedPosts() {
  return useQuery({
    queryKey: [...FEED_KEY, "saved"],
    queryFn: feed.getSavedPosts,
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
