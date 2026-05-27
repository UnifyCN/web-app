import type { FeedResponse, FeedTab, Post, User } from "@/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { posts as mockPosts, followedUsernames } from "@/lib/mock/posts";

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
  title: string;
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
    title: row.title,
    content: row.content,
    likeCount: row.like_count ?? 0,
    commentCount: row.comment_count ?? 0,
    saveCount: 0, // filled in by enrichPostsWithMetadata
    userId: row.user_id,
    groupId: row.group_id == null ? null : String(row.group_id),
    isPinned: row.is_pinned ?? false,
    postImageUrls: row.post_image_urls ?? [],
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
    p_post_ids: postIds,
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
      liked_by_me: Boolean(row.liked_by_me),
      saved_by_me: Boolean(row.saved_by_me),
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

async function getAuthUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
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
  const offset = Number.isFinite(parsed) ? parsed : 0;
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
  const offset = Number.isFinite(parsed) ? parsed : 0;
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

export async function getGroupPosts(groupId: string): Promise<Post[]> {
  return mockPosts.filter((post) => post.groupId === groupId);
}

export async function getUserPosts(userId: string): Promise<Post[]> {
  return mockPosts.filter((post) => post.author.id === userId);
}

export async function getSavedPosts(): Promise<Post[]> {
  return mockPosts.filter((post) => post.savedByMe);
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

/* ---- legacy single-arg wrappers (kept for FeedTab caller, if any) ----- */

export async function getFeedPosts(
  tab: FeedTab = "For You",
): Promise<Post[]> {
  if (tab === "Following") return (await getFollowingFeed()).posts;
  if (tab === "Groups") return (await getGroupsFeed()).posts;
  return (await getForYouFeed()).posts;
}
