import type {
  FeedResponse,
  FeedTab,
  Post,
  PostComment,
  User,
  UserComment,
} from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { posts as mockPosts, followedUsernames } from "@/lib/mock/posts";
import { currentUser } from "@/lib/mock/users";
import { mockCommentsForPost } from "@/lib/mock/comments";

/**
 * Feed / posts data access. Real path queries Supabase posts with joined
 * user/group rows and enriches each page through the get_post_metadata_batch
 * RPC for per-user fields (likedByMe, savedByMe, saveCount). Falls back to
 * mock data when Supabase isn't configured or the user isn't signed in, to
 * keep the home page browsable pre-config (mirrors profile/checklist).
 *
 * Phase 4 is first-page-only — pagination machinery is in the service surface
 * (cursor + nextCursor) so a follow-up can wire infinite scroll without
 * touching the data layer again.
 */

const POSTS_SELECT = `
  id, title, content, like_count, comment_count, is_pinned, created_at,
  user_id, group_id, post_image_urls,
  users!user_id ( id, username, profile_picture_url ),
  groups!group_id ( id, group_name )
`;

const DEFAULT_LIMIT = 20;

interface JoinedPostRow {
  id: number;
  title: string | null;
  content: string;
  like_count: number | null;
  comment_count: number | null;
  is_pinned: boolean | null;
  created_at: string;
  user_id: string;
  group_id: number | null;
  post_image_urls: string[] | null;
  users: {
    id: string;
    username: string;
    profile_picture_url: string | null;
  } | null;
  groups: { id: number; group_name: string } | null;
}

/** True for absolute http(s) URLs. The shared (mobile) DB stores image
 *  references as bucket paths ("users/<uid>/<file>.jpg"), and next/image throws
 *  on a bare relative src — so we keep only renderable absolute URLs. */
const isHttpUrl = (s: string): boolean => /^https?:\/\//i.test(s);

function rowToPost(row: JoinedPostRow): Post {
  const author: User = row.users
    ? {
        id: row.users.id,
        username: row.users.username,
        profilePictureUrl: row.users.profile_picture_url,
        isPremium: false,
        permissions: [],
      }
    : {
        id: row.user_id,
        username: "Unknown",
        profilePictureUrl: null,
        isPremium: false,
        permissions: [],
      };

  return {
    id: row.id,
    title: row.title ?? "",
    content: row.content,
    likeCount: row.like_count ?? 0,
    commentCount: row.comment_count ?? 0,
    saveCount: 0, // filled in by enrichPostsWithMetadata
    userId: row.user_id,
    groupId: row.group_id,
    isPinned: row.is_pinned ?? false,
    postImageUrls: (row.post_image_urls ?? []).filter(isHttpUrl),
    createdAt: row.created_at,
    author,
    groupName: row.groups?.group_name ?? undefined,
    likedByMe: false, // filled in by enrichPostsWithMetadata
    savedByMe: false, // filled in by enrichPostsWithMetadata
  };
}

interface PostMetadata {
  like_count: number;
  comment_count: number;
  save_count: number;
  liked_by_me: boolean;
  saved_by_me: boolean;
}

async function getPostMetadataBatch(
  postIds: number[],
): Promise<Map<number, PostMetadata>> {
  if (postIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_post_metadata_batch", {
    post_ids: postIds,
  });
  if (error) throw error;

  const map = new Map<number, PostMetadata>();
  for (const row of (data as Array<Record<string, unknown>>) ?? []) {
    const postId = Number(row.post_id);
    if (!Number.isFinite(postId)) continue;
    map.set(postId, {
      like_count: Number(row.like_count ?? 0),
      comment_count: Number(row.comment_count ?? 0),
      save_count: Number(row.save_count ?? 0),
      liked_by_me: Boolean(row.is_liked ?? row.liked_by_me),
      saved_by_me: Boolean(row.is_saved ?? row.saved_by_me),
    });
  }
  return map;
}

async function enrichPostsWithMetadata(posts: Post[]): Promise<Post[]> {
  if (posts.length === 0) return posts;
  try {
    const meta = await getPostMetadataBatch(posts.map((p) => p.id));
    return posts.map((post) => {
      const m = meta.get(post.id);
      if (!m) return post;
      return {
        ...post,
        likeCount: m.like_count,
        commentCount: m.comment_count,
        saveCount: m.save_count,
        likedByMe: m.liked_by_me,
        savedByMe: m.saved_by_me,
      };
    });
  } catch (error) {
    // Feed still renders if the RPC fails — counts fall back to whatever
    // came off the posts row, likedByMe / savedByMe stay false.
    console.error("enrichPostsWithMetadata failed", error);
    return posts;
  }
}

function mockForTab(tab: FeedTab): Post[] {
  if (tab === "Following") {
    return mockPosts.filter((post) =>
      followedUsernames.includes(post.author.username),
    );
  }
  if (tab === "Groups") {
    return mockPosts.filter((post) => post.groupId !== null);
  }
  return mockPosts;
}

export async function getForYouFeed(
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<FeedResponse> {
  if (!isSupabaseConfigured()) {
    return { posts: mockForTab("For You"), nextCursor: undefined };
  }

  const userId = await getAuthUserId();
  if (!userId) return { posts: mockForTab("For You"), nextCursor: undefined };

  const supabase = createClient();
  const isFirstPage = !cursor;

  if (isFirstPage) {
    // Page 1: pinned (ordered by created_at since there's no pinned_at column)
    // spliced ahead of the first `limit` non-pinned posts.
    const [pinnedRes, nonPinnedRes] = await Promise.all([
      supabase
        .from("posts")
        .select(POSTS_SELECT)
        .is("group_id", null)
        .eq("is_pinned", true)
        .order("created_at", { ascending: false }),
      supabase
        .from("posts")
        .select(POSTS_SELECT)
        .is("group_id", null)
        .eq("is_pinned", false)
        .order("created_at", { ascending: false })
        .limit(limit),
    ]);

    if (pinnedRes.error) throw pinnedRes.error;
    if (nonPinnedRes.error) throw nonPinnedRes.error;

    const pinnedPosts = (pinnedRes.data as unknown as JoinedPostRow[]).map(
      rowToPost,
    );
    // Cap pinned at the page limit so a flood of pinned posts can't blow past
    // it; fill remaining slots with non-pinned.
    const cappedPinned = pinnedPosts.slice(0, limit);
    const remaining = limit - cappedPinned.length;
    const nonPinnedRows = (nonPinnedRes.data as unknown as JoinedPostRow[]).slice(
      0,
      remaining,
    );
    const nonPinned = nonPinnedRows.map(rowToPost);

    const enriched = await enrichPostsWithMetadata([
      ...cappedPinned,
      ...nonPinned,
    ]);

    // Fall back to the last pinned post's createdAt when there are no
    // non-pinned posts on this page, so page 2 still has a starting point.
    const lastNonPinned = nonPinnedRows[nonPinnedRows.length - 1];
    const nextCursor =
      lastNonPinned?.created_at ??
      cappedPinned[cappedPinned.length - 1]?.createdAt;

    return { posts: enriched, nextCursor };
  }

  // Page 2+: only non-pinned, keyset on created_at.
  const { data, error } = await supabase
    .from("posts")
    .select(POSTS_SELECT)
    .is("group_id", null)
    .eq("is_pinned", false)
    .lt("created_at", cursor)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) throw error;

  const rows = (data as unknown as JoinedPostRow[]) ?? [];
  const posts = rows.map(rowToPost);
  const enriched = await enrichPostsWithMetadata(posts);
  const nextCursor =
    enriched.length === limit ? rows[rows.length - 1]?.created_at : undefined;

  return { posts: enriched, nextCursor };
}

export async function getFollowingFeed(
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<FeedResponse> {
  if (!isSupabaseConfigured()) {
    return { posts: mockForTab("Following"), nextCursor: undefined };
  }

  const userId = await getAuthUserId();
  if (!userId) {
    return { posts: mockForTab("Following"), nextCursor: undefined };
  }

  const supabase = createClient();

  const followingRes = await supabase
    .from("user_followers")
    .select("following_id")
    .eq("follower_id", userId);
  if (followingRes.error) throw followingRes.error;

  const followingIds = (followingRes.data ?? []).map((r) => r.following_id);
  if (followingIds.length === 0) return { posts: [], nextCursor: undefined };

  const parsed = cursor ? parseInt(cursor, 10) : 0;
  const offset = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const { data, error } = await supabase
    .from("posts")
    .select(POSTS_SELECT)
    .in("user_id", followingIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const posts = (data as unknown as JoinedPostRow[]).map(rowToPost);
  const enriched = await enrichPostsWithMetadata(posts);
  const nextCursor =
    enriched.length === limit ? String(offset + limit) : undefined;

  return { posts: enriched, nextCursor };
}

export async function getGroupsFeed(
  cursor?: string,
  limit: number = DEFAULT_LIMIT,
): Promise<FeedResponse> {
  if (!isSupabaseConfigured()) {
    return { posts: mockForTab("Groups"), nextCursor: undefined };
  }

  const userId = await getAuthUserId();
  if (!userId) return { posts: mockForTab("Groups"), nextCursor: undefined };

  const supabase = createClient();

  const membershipRes = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", userId);
  if (membershipRes.error) throw membershipRes.error;

  const groupIds = (membershipRes.data ?? []).map((r) => r.group_id);
  if (groupIds.length === 0) return { posts: [], nextCursor: undefined };

  const parsed = cursor ? parseInt(cursor, 10) : 0;
  const offset = Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  const { data, error } = await supabase
    .from("posts")
    .select(POSTS_SELECT)
    .in("group_id", groupIds)
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);
  if (error) throw error;

  const posts = (data as unknown as JoinedPostRow[]).map(rowToPost);
  const enriched = await enrichPostsWithMetadata(posts);
  const nextCursor =
    enriched.length === limit ? String(offset + limit) : undefined;

  return { posts: enriched, nextCursor };
}

/* ---- mock-only helpers (kept for unwired surfaces) -------------------- */

export async function getGroupPosts(groupId: number): Promise<Post[]> {
  return mockPosts.filter((post) => post.groupId === groupId);
}

/* ---- profile feeds (Supabase-wired, mock fallback) -------------------- */

/**
 * All posts authored by `userId`, newest first, enriched with per-user
 * metadata. `posts` is public-read RLS so this works for any user; falls back
 * to the local feed pre-config.
 */
export async function getUserPosts(userId: string): Promise<Post[]> {
  if (!isSupabaseConfigured()) {
    return mockPosts.filter((post) => post.author.id === userId);
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POSTS_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const posts = (data as unknown as JoinedPostRow[]).map(rowToPost);
  return enrichPostsWithMetadata(posts);
}

/**
 * Posts the signed-in user has saved, most-recently-saved first. Reads the
 * own-row `post_saves` table with the joined post embedded, so only the
 * caller's saves come back (RLS). Falls back to the local feed pre-config.
 */
export async function getSavedPosts(): Promise<Post[]> {
  if (!isSupabaseConfigured()) {
    return mockPosts.filter((post) => post.savedByMe);
  }

  const userId = await getAuthUserId();
  if (!userId) return mockPosts.filter((post) => post.savedByMe);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("post_saves")
    .select(`created_at, posts!post_id ( ${POSTS_SELECT} )`)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data ?? []) as unknown as { posts: JoinedPostRow | null }[];
  const posts = rows
    .map((row) => row.posts)
    .filter((post): post is JoinedPostRow => post !== null)
    .map(rowToPost);
  return enrichPostsWithMetadata(posts);
}

/* ---- like / save mutations -------------------------------------------- */

export async function likePost(postId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("likePost: no auth session");

  // (user_id, post_id) is the composite PK, so a duplicate insert means the
  // user already liked it — treat as idempotent success rather than rolling
  // back optimistic UI for a stale double-tap.
  const { error } = await supabase
    .from("post_likes")
    .insert({ user_id: userId, post_id: postId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unlikePost(postId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("unlikePost: no auth session");

  const { error } = await supabase
    .from("post_likes")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);
  if (error) throw error;
}

export async function savePost(postId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("savePost: no auth session");

  const { error } = await supabase
    .from("post_saves")
    .insert({ user_id: userId, post_id: postId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unsavePost(postId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("unsavePost: no auth session");

  const { error } = await supabase
    .from("post_saves")
    .delete()
    .eq("post_id", postId)
    .eq("user_id", userId);
  if (error) throw error;
}

/* ---- create post ------------------------------------------------------ */

export interface CreatePostInput {
  title: string;
  content: string;
  /** null = "For You" (no group); otherwise the destination group id. */
  groupId: number | null;
  /** Public URLs from the post-images bucket (see lib/supabase/uploadImage). */
  postImageUrls?: string[];
}

/**
 * Create a post. Inserts into `posts` (own-row RLS: `user_id = auth.uid()`) and
 * returns the created Post via the same joined select the feed uses, so the
 * author/group come back hydrated. In the mock build it returns a synthesized
 * Post so the composer flow stays exercisable without Supabase.
 */
export async function createPost(input: CreatePostInput): Promise<Post> {
  const title = input.title.trim();
  const content = input.content.trim();
  const postImageUrls = input.postImageUrls ?? [];

  if (!isSupabaseConfigured()) {
    return {
      id: Date.now(),
      title,
      content,
      likeCount: 0,
      commentCount: 0,
      saveCount: 0,
      userId: "mock-user",
      groupId: input.groupId,
      isPinned: false,
      postImageUrls,
      createdAt: new Date().toISOString(),
      author: {
        id: "mock-user",
        username: "You",
        profilePictureUrl: null,
        isPremium: false,
        permissions: [],
      },
      groupName: undefined,
      likedByMe: false,
      savedByMe: false,
    };
  }

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("createPost: no auth session");

  const { data, error } = await supabase
    .from("posts")
    .insert({
      title,
      content,
      group_id: input.groupId,
      user_id: userId,
      post_image_urls: postImageUrls,
    })
    .select(POSTS_SELECT)
    .single();
  if (error) throw error;

  return rowToPost(data as unknown as JoinedPostRow);
}

/* ---- post detail + comments ------------------------------------------- */

/**
 * Fetch a single post with the same joined select + per-user enrichment the
 * feed uses. Returns null when the id doesn't resolve. Mock fallback finds the
 * post in the local feed so the detail page stays browsable pre-config.
 */
export async function getPost(postId: number): Promise<Post | null> {
  if (!isSupabaseConfigured()) {
    return mockPosts.find((post) => post.id === postId) ?? null;
  }

  const userId = await getAuthUserId();
  if (!userId) return mockPosts.find((post) => post.id === postId) ?? null;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("posts")
    .select(POSTS_SELECT)
    .eq("id", postId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const [enriched] = await enrichPostsWithMetadata([
    rowToPost(data as unknown as JoinedPostRow),
  ]);
  return enriched;
}

const COMMENTS_SELECT = `
  id, content, parent_comment_id, created_at, user_id, post_id,
  users!user_id ( id, username, profile_picture_url )
`;

interface JoinedCommentRow {
  id: number;
  content: string;
  parent_comment_id: number | null;
  created_at: string;
  user_id: string;
  post_id: number;
  users: {
    id: string;
    username: string;
    profile_picture_url: string | null;
  } | null;
}

function commentRowToPostComment(row: JoinedCommentRow): PostComment {
  const author: User = row.users
    ? {
        id: row.users.id,
        username: row.users.username,
        profilePictureUrl: row.users.profile_picture_url,
        isPremium: false,
        permissions: [],
      }
    : {
        id: row.user_id,
        username: "Unknown",
        profilePictureUrl: null,
        isPremium: false,
        permissions: [],
      };

  return {
    id: row.id,
    userId: row.user_id,
    postId: row.post_id,
    content: row.content,
    parentCommentId: row.parent_comment_id,
    likeCount: 0, // filled in by enrichCommentsWithLikes
    createdAt: row.created_at,
    author,
    likedByMe: false, // filled in by enrichCommentsWithLikes
  };
}

/**
 * Attach likeCount + likedByMe to each comment from comment_likes. Resilient:
 * if the comment_likes table isn't present yet (migration not applied), the
 * comments still render with zero likes rather than failing the whole page.
 */
async function enrichCommentsWithLikes(
  comments: PostComment[],
  userId: string,
): Promise<PostComment[]> {
  if (comments.length === 0) return comments;
  try {
    const supabase = createClient();
    const { data, error } = await supabase
      .from("comment_likes")
      .select("comment_id, user_id")
      .in(
        "comment_id",
        comments.map((c) => c.id),
      );
    if (error) throw error;

    const counts = new Map<number, number>();
    const mine = new Set<number>();
    for (const row of (data as { comment_id: number; user_id: string }[]) ??
      []) {
      counts.set(row.comment_id, (counts.get(row.comment_id) ?? 0) + 1);
      if (row.user_id === userId) mine.add(row.comment_id);
    }

    return comments.map((c) => ({
      ...c,
      likeCount: counts.get(c.id) ?? 0,
      likedByMe: mine.has(c.id),
    }));
  } catch (error) {
    console.error("enrichCommentsWithLikes failed", error);
    return comments;
  }
}

/**
 * All comments for a post (top-level + replies), oldest first. The detail page
 * groups them into threads client-side. Mock fallback serves the local thread.
 */
export async function getComments(postId: number): Promise<PostComment[]> {
  if (!isSupabaseConfigured()) return mockCommentsForPost(postId);

  const userId = await getAuthUserId();
  if (!userId) return mockCommentsForPost(postId);

  const supabase = createClient();
  const { data, error } = await supabase
    .from("post_comments")
    .select(COMMENTS_SELECT)
    .eq("post_id", postId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  const comments = (data as unknown as JoinedCommentRow[]).map(
    commentRowToPostComment,
  );
  return enrichCommentsWithLikes(comments, userId);
}

const USER_COMMENTS_SELECT = `
  id, content, parent_comment_id, created_at, user_id, post_id,
  users!user_id ( id, username, profile_picture_url ),
  posts!post_id ( id, title, author:users!user_id ( username ) )
`;

interface UserCommentRow extends JoinedCommentRow {
  posts: {
    id: number;
    title: string;
    author: { username: string } | null;
  } | null;
}

/**
 * All comments authored by `userId`, newest first, each carrying the title +
 * author of the post it's on (for the profile Comments tab). post_comments +
 * posts are public-read RLS so this works for any user. Mock fallback scans the
 * local threads across mock posts.
 */
export async function getUserComments(userId: string): Promise<UserComment[]> {
  if (!isSupabaseConfigured()) {
    return mockPosts
      .flatMap((post) =>
        mockCommentsForPost(post.id)
          .filter((comment) => comment.author.id === userId)
          .map((comment) => ({
            ...comment,
            postTitle: post.title,
            postAuthorUsername: post.author.username,
          })),
      )
      // Match the Supabase path's newest-first ordering (flatMap groups by post).
      .sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
      );
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("post_comments")
    .select(USER_COMMENTS_SELECT)
    .eq("user_id", userId)
    .order("created_at", { ascending: false });
  if (error) throw error;

  const rows = (data as unknown as UserCommentRow[]) ?? [];
  return rows.flatMap((row) => {
    // The post (+ its author) should always join; if either is null the data is
    // unexpected — surface it in dev and drop the row rather than masking it.
    if (!row.posts || !row.posts.author) {
      console.error("getUserComments: comment missing post/author join", row.id);
      return [];
    }
    return [
      {
        ...commentRowToPostComment(row),
        postTitle: row.posts.title,
        postAuthorUsername: row.posts.author.username,
      },
    ];
  });
}

export interface CreateCommentInput {
  postId: number;
  content: string;
  /** null = top-level comment; otherwise the thread-root comment id. */
  parentCommentId?: number | null;
}

/**
 * Create a comment. Inserts into post_comments (own-row RLS) and returns the
 * created PostComment via the joined select so the author comes back hydrated;
 * the update_post_comment_count trigger bumps posts.comment_count. Mock
 * synthesizes a comment authored by the current mock user.
 */
export async function createComment(
  input: CreateCommentInput,
): Promise<PostComment> {
  const content = input.content.trim();
  const parentCommentId = input.parentCommentId ?? null;

  if (!isSupabaseConfigured()) {
    return {
      id: Date.now(),
      userId: currentUser.id,
      postId: input.postId,
      content,
      parentCommentId,
      likeCount: 0,
      createdAt: new Date().toISOString(),
      author: currentUser,
      likedByMe: false,
    };
  }

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("createComment: no auth session");

  const { data, error } = await supabase
    .from("post_comments")
    .insert({
      post_id: input.postId,
      user_id: userId,
      content,
      parent_comment_id: parentCommentId,
    })
    .select(COMMENTS_SELECT)
    .single();
  if (error) throw error;

  return commentRowToPostComment(data as unknown as JoinedCommentRow);
}

/** Delete a comment the caller owns (RLS comments_delete_own enforces it). */
export async function deleteComment(commentId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("deleteComment: no auth session");

  const { error } = await supabase
    .from("post_comments")
    .delete()
    .eq("id", commentId);
  if (error) throw error;
}

export async function likeComment(commentId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("likeComment: no auth session");

  // (user_id, comment_id) PK — a duplicate insert means already liked; treat
  // as idempotent success (same as likePost).
  const { error } = await supabase
    .from("comment_likes")
    .insert({ user_id: userId, comment_id: commentId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unlikeComment(commentId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("unlikeComment: no auth session");

  const { error } = await supabase
    .from("comment_likes")
    .delete()
    .eq("comment_id", commentId)
    .eq("user_id", userId);
  if (error) throw error;
}

/** Delete a post the caller owns (RLS own-row). Comments/likes/saves cascade. */
export async function deletePost(postId: number): Promise<void> {
  if (!isSupabaseConfigured()) return;

  const supabase = createClient();
  const userId = await getAuthUserId();
  if (!userId) throw new Error("deletePost: no auth session");

  const { error } = await supabase.from("posts").delete().eq("id", postId);
  if (error) throw error;
}

/* ---- legacy single-arg wrappers (kept for FeedTab caller, if any) ----- */

export async function getFeedPosts(
  tab: FeedTab = "For You",
): Promise<Post[]> {
  if (tab === "Following") return (await getFollowingFeed()).posts;
  if (tab === "Groups") return (await getGroupsFeed()).posts;
  return (await getForYouFeed()).posts;
}
