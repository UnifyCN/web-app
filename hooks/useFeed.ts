import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
} from "@tanstack/react-query";
import type { FeedTab, Post } from "@/types";
import {
  storageImageUrl,
  storageImageUrlAt,
} from "@/lib/supabase/imageUrl";
import * as feed from "@/services/feed";
import { fetchBlockedUserIds } from "@/hooks/useModeration";
import { trackCommentCreated, trackPostCreated } from "@/lib/analytics";

/** React Query hooks for feed / posts data. */

const FEED_KEY = ["feed"] as const;

/* ---- Per-tab feed queries (cursor-paginated, infinite scroll) --------- */

/** One page of the For You feed, using the cached blocked-id list. */
async function fetchForYouPage(
  queryClient: QueryClient,
  pageParam: string | undefined,
) {
  const blockedIds = await fetchBlockedUserIds(queryClient);
  return feed.getForYouFeed(pageParam, undefined, blockedIds);
}

export function useForYouFeed(enabled: boolean = true) {
  const queryClient = useQueryClient();
  return useInfiniteQuery({
    queryKey: [...FEED_KEY, "forYou"],
    queryFn: ({ pageParam }) => fetchForYouPage(queryClient, pageParam),
    // Keyset cursor on (created_at, id); first page has no cursor.
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
    // Keyset cursor on (created_at, id); first page has no cursor.
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor ?? undefined,
    enabled,
    staleTime: 60_000,
  });
}

export function useGroupsFeed(enabled: boolean = true) {
  return useInfiniteQuery({
    queryKey: [...FEED_KEY, "groups"],
    queryFn: ({ pageParam }) => feed.getGroupsFeed(pageParam),
    // Keyset cursor on (created_at, id); first page has no cursor.
    initialPageParam: undefined as string | undefined,
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
    onSuccess: (post, input) => {
      // Refetch every tab so the new post shows up wherever it belongs.
      queryClient.invalidateQueries({ queryKey: FEED_KEY });
      trackPostCreated({ postId: post.id, groupId: input.groupId });
    },
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
    onSuccess: (comment, { postId, content, parentCommentId }) => {
      queryClient.invalidateQueries({ queryKey: [...COMMENTS_KEY, postId] });
      // posts.comment_count changes via the DB trigger — refresh the feed
      // badge + the detail post.
      queryClient.invalidateQueries({ queryKey: FEED_KEY });
      trackCommentCreated({
        postId,
        commentId: comment.id,
        isReply: Boolean(parentCommentId),
        bodyLength: content.length,
      });
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

/* ---- Prefetch (same keys and fetchers as the hooks above) ------------- */

// How much of the first screen of the feed gets its pictures fetched ahead.
const WARM_AVATARS = 8;
const WARM_POST_IMAGES = 2;

/** Fetches the pictures at the top of a feed page into the browser cache. */
function warmFeedImages(posts: Post[]): void {
  if (typeof window === "undefined") return;
  const urls = new Set<string>();
  for (const post of posts.slice(0, WARM_AVATARS)) {
    // 40px is the size PostCard renders the author avatar at.
    const avatar = storageImageUrl(post.author.profilePictureUrl, 40);
    if (avatar) urls.add(avatar);
  }
  for (const post of posts.slice(0, WARM_POST_IMAGES)) {
    // 640 is StorageImage's fallback width, and what a single-image post
    // resolves to on a phone or in the desktop feed column.
    const image = storageImageUrlAt(post.postImageUrls[0], 640);
    if (image) urls.add(image);
  }
  for (const url of urls) new window.Image().src = url;
}

/**
 * Warms the first page of the For You feed, the Social tab's default view,
 * and then the pictures at the top of it, so the tab opens with faces already
 * in place instead of initials.
 */
export async function prefetchForYouFeed(queryClient: QueryClient) {
  const queryKey = [...FEED_KEY, "forYou"];
  await queryClient.prefetchInfiniteQuery({
    queryKey,
    queryFn: ({ pageParam }) => fetchForYouPage(queryClient, pageParam),
    initialPageParam: undefined as string | undefined,
    staleTime: 60_000,
  });
  const cached = queryClient.getQueryData<{ pages: { posts: Post[] }[] }>(
    queryKey,
  );
  warmFeedImages(cached?.pages[0]?.posts ?? []);
}

/** Warms a user's own posts, the Profile page's default tab. */
export function prefetchUserPosts(queryClient: QueryClient, userId: string) {
  return queryClient.prefetchQuery({
    queryKey: [...FEED_KEY, "user", userId],
    queryFn: () => feed.getUserPosts(userId),
  });
}
