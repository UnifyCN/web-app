import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type {
  Discussion,
  DiscussionReply,
  DiscussionSort,
  DiscussionStatus,
  ModuleDiscussionStats,
  User,
} from "@/types";
import {
  mockDiscussions,
  mockDiscussionStats,
  mockRepliesByDiscussion,
} from "@/lib/mock/discussions";

/**
 * Module-discussion data access (In-Lesson Help, community path).
 *
 * Runs against the shared production DB's `module_discussions` /
 * `discussion_replies` / `discussion_likes` / `discussion_reply_likes` tables
 * (migration 20260627175443 — built once for web + mobile; web is the first
 * client). Counters (`like_count`, `reply_count`) are trigger-maintained
 * server-side, so likes are plain insert/delete of the per-user like row.
 * `discussion_likes` SELECT is own-row RLS, so `likedByMe` comes from the
 * `get_discussion_metadata_batch` / `get_discussion_reply_metadata_batch`
 * RPCs (mirrors the feed's `get_post_metadata_batch` pattern). Reporting is
 * NOT here — `discussion_reports` has no INSERT policy; reports route through
 * the `report-discussion` edge function via services/moderation.ts.
 *
 * Follows the Community wiring pattern: `isSupabaseConfigured()` +
 * `getAuthUserId()` guards, snake_case row mappers, mock fallback for the
 * local-dev / env-not-configured case.
 */

const PAGE_SIZE = 20;

/* ---- Row shapes + mappers ---------------------------------------------- */

const DISCUSSIONS_SELECT = `
  id, module_id, submodule_id, lesson_id, author_id, body,
  like_count, reply_count, status, created_at,
  users!author_id ( id, username, profile_picture_url )
`;

interface JoinedAuthorRow {
  id: string;
  username: string;
  profile_picture_url: string | null;
}

interface JoinedDiscussionRow {
  id: string;
  module_id: string;
  submodule_id: string | null;
  lesson_id: string | null;
  author_id: string;
  body: string;
  like_count: number;
  reply_count: number;
  status: DiscussionStatus;
  created_at: string;
  users: JoinedAuthorRow | null;
}

const REPLIES_SELECT = `
  id, discussion_id, author_id, body, like_count, status, created_at,
  users!author_id ( id, username, profile_picture_url )
`;

interface JoinedReplyRow {
  id: string;
  discussion_id: string;
  author_id: string;
  body: string;
  like_count: number;
  status: DiscussionStatus;
  created_at: string;
  users: JoinedAuthorRow | null;
}

function rowToAuthor(users: JoinedAuthorRow | null, authorId: string): User {
  return users
    ? {
        id: users.id,
        username: users.username,
        profilePictureUrl: users.profile_picture_url,
        isPremium: false,
        permissions: [],
      }
    : {
        id: authorId,
        username: "Unknown",
        profilePictureUrl: null,
        isPremium: false,
        permissions: [],
      };
}

function rowToDiscussion(row: JoinedDiscussionRow): Discussion {
  return {
    id: row.id,
    moduleId: row.module_id,
    submoduleId: row.submodule_id,
    lessonId: row.lesson_id,
    body: row.body,
    likeCount: row.like_count ?? 0,
    replyCount: row.reply_count ?? 0,
    status: row.status,
    createdAt: row.created_at,
    author: rowToAuthor(row.users, row.author_id),
    likedByMe: false, // filled in by enrichDiscussionsWithMetadata
  };
}

function rowToReply(row: JoinedReplyRow): DiscussionReply {
  return {
    id: row.id,
    discussionId: row.discussion_id,
    body: row.body,
    likeCount: row.like_count ?? 0,
    createdAt: row.created_at,
    author: rowToAuthor(row.users, row.author_id),
    likedByMe: false, // filled in by enrichRepliesWithMetadata
  };
}

/** Map the DB's banned-word / length CHECK rejection (23514) to a message the
 *  composer can show verbatim. Everything else rethrows untouched. */
function toFriendlyBodyError(error: unknown): Error {
  const err = error as { code?: string; message?: string };
  if (
    err?.code === "23514" ||
    /community guidelines|check constraint/i.test(err?.message ?? "")
  ) {
    return new Error(
      "This can't be posted — it may go against our community guidelines or be too long. Please reword and try again.",
    );
  }
  return error instanceof Error ? error : new Error(String(error));
}

/* ---- Metadata enrichment (batch RPCs) ----------------------------------- */

interface DiscussionMetadata {
  like_count: number;
  reply_count: number;
  is_liked: boolean;
}

async function getDiscussionMetadataBatch(
  discussionIds: string[],
): Promise<Map<string, DiscussionMetadata>> {
  if (discussionIds.length === 0) return new Map();
  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_discussion_metadata_batch", {
    discussion_ids: discussionIds,
  });
  if (error) throw error;

  const map = new Map<string, DiscussionMetadata>();
  for (const row of (data as Array<Record<string, unknown>>) ?? []) {
    if (typeof row.discussion_id !== "string") continue;
    map.set(row.discussion_id, {
      like_count: Number(row.like_count ?? 0),
      reply_count: Number(row.reply_count ?? 0),
      is_liked: Boolean(row.is_liked),
    });
  }
  return map;
}

async function enrichDiscussionsWithMetadata(
  discussions: Discussion[],
): Promise<Discussion[]> {
  if (discussions.length === 0) return discussions;
  try {
    const meta = await getDiscussionMetadataBatch(discussions.map((d) => d.id));
    return discussions.map((d) => {
      const m = meta.get(d.id);
      if (!m) return d;
      return {
        ...d,
        likeCount: m.like_count,
        replyCount: m.reply_count,
        likedByMe: m.is_liked,
      };
    });
  } catch (error) {
    // The board still renders if the RPC fails — counts fall back to the
    // trigger-maintained row values, likedByMe stays false.
    console.error("enrichDiscussionsWithMetadata failed", error);
    return discussions;
  }
}

async function enrichRepliesWithMetadata(
  replies: DiscussionReply[],
): Promise<DiscussionReply[]> {
  if (replies.length === 0) return replies;
  try {
    const supabase = createClient();
    const { data, error } = await supabase.rpc(
      "get_discussion_reply_metadata_batch",
      { reply_ids: replies.map((r) => r.id) },
    );
    if (error) throw error;

    const map = new Map<string, { like_count: number; is_liked: boolean }>();
    for (const row of (data as Array<Record<string, unknown>>) ?? []) {
      if (typeof row.reply_id !== "string") continue;
      map.set(row.reply_id, {
        like_count: Number(row.like_count ?? 0),
        is_liked: Boolean(row.is_liked),
      });
    }
    return replies.map((r) => {
      const m = map.get(r.id);
      if (!m) return r;
      return { ...r, likeCount: m.like_count, likedByMe: m.is_liked };
    });
  } catch (error) {
    console.error("enrichRepliesWithMetadata failed", error);
    return replies;
  }
}

/* ---- Reads -------------------------------------------------------------- */

export interface DiscussionPage {
  discussions: Discussion[];
  /** Opaque cursor for the next page; undefined when this is the last page.
   *  `recent` → keyset ISO timestamp; `top` → numeric offset (like-ordered
   *  keysets aren't expressible in a single PostgREST filter). */
  nextCursor: string | undefined;
}

export interface GetDiscussionsOptions {
  submoduleId?: string | null;
  sort?: DiscussionSort;
  cursor?: string;
}

/** One page of a module's visible discussion threads (newest or most-liked
 *  first), with author join + per-user like enrichment. */
export async function getDiscussions(
  moduleId: string,
  options: GetDiscussionsOptions = {},
): Promise<DiscussionPage> {
  const { submoduleId, sort = "recent", cursor } = options;

  if (!isSupabaseConfigured()) {
    // Mock mode (env not configured / local dev) ignores the module/submodule
    // filters so the board always has content to render locally (mock ids don't
    // match live Sanity ids). A missing auth session is NOT mock mode — it's a
    // loading/auth-gated state; the query below is RLS-scoped and returns empty
    // for an unauthenticated caller rather than fake data.
    return { discussions: mockDiscussions, nextCursor: undefined };
  }

  const supabase = createClient();
  let query = supabase
    .from("module_discussions")
    .select(DISCUSSIONS_SELECT)
    .eq("module_id", moduleId)
    .eq("status", "visible")
    .limit(PAGE_SIZE);
  if (submoduleId) query = query.eq("submodule_id", submoduleId);

  if (sort === "top") {
    const offset = cursor ? Number.parseInt(cursor, 10) || 0 : 0;
    query = query
      .order("like_count", { ascending: false })
      .order("created_at", { ascending: false })
      .range(offset, offset + PAGE_SIZE - 1);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data as unknown as JoinedDiscussionRow[]) ?? [];
    const discussions = await enrichDiscussionsWithMetadata(
      rows.map(rowToDiscussion),
    );
    return {
      discussions,
      nextCursor:
        rows.length === PAGE_SIZE ? String(offset + PAGE_SIZE) : undefined,
    };
  }

  // recent — keyset on created_at (matches the feed's cursor pattern).
  query = query.order("created_at", { ascending: false });
  if (cursor) query = query.lt("created_at", cursor);
  const { data, error } = await query;
  if (error) throw error;
  const rows = (data as unknown as JoinedDiscussionRow[]) ?? [];
  const discussions = await enrichDiscussionsWithMetadata(
    rows.map(rowToDiscussion),
  );
  return {
    discussions,
    nextCursor:
      rows.length === PAGE_SIZE ? rows[rows.length - 1].created_at : undefined,
  };
}

/** All visible replies for a thread, oldest first (matches getComments). */
export async function getReplies(
  discussionId: string,
): Promise<DiscussionReply[]> {
  if (!isSupabaseConfigured()) {
    return mockRepliesByDiscussion[discussionId] ?? [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("discussion_replies")
    .select(REPLIES_SELECT)
    .eq("discussion_id", discussionId)
    .eq("status", "visible")
    .order("created_at", { ascending: true });
  if (error) throw error;

  return enrichRepliesWithMetadata(
    ((data as unknown as JoinedReplyRow[]) ?? []).map(rowToReply),
  );
}

/** Board-header / chooser-badge stats (visible threads + distinct authors). */
export async function getModuleDiscussionStats(
  moduleId: string,
): Promise<ModuleDiscussionStats> {
  if (!isSupabaseConfigured()) {
    return mockDiscussionStats;
  }

  const supabase = createClient();
  const { data, error } = await supabase.rpc("get_module_discussion_stats", {
    p_module_id: moduleId,
  });
  if (error) throw error;

  const row = ((data as Array<Record<string, unknown>>) ?? [])[0];
  return {
    discussionCount: Number(row?.discussion_count ?? 0),
    participantCount: Number(row?.participant_count ?? 0),
  };
}

/* ---- Mutations ----------------------------------------------------------- */

export interface CreateDiscussionInput {
  moduleId: string;
  submoduleId: string | null;
  lessonId: string | null;
  body: string;
}

export async function createDiscussion(
  input: CreateDiscussionInput,
): Promise<Discussion> {
  if (!isSupabaseConfigured()) {
    throw new Error("createDiscussion: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("createDiscussion: no auth session");

  const body = input.body.trim();
  if (!body) throw new Error("Please write a question first.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("module_discussions")
    .insert({
      module_id: input.moduleId,
      submodule_id: input.submoduleId,
      lesson_id: input.lessonId,
      author_id: userId,
      body,
    })
    .select(DISCUSSIONS_SELECT)
    .single();
  if (error) throw toFriendlyBodyError(error);

  return rowToDiscussion(data as unknown as JoinedDiscussionRow);
}

export async function createReply(
  discussionId: string,
  body: string,
): Promise<DiscussionReply> {
  if (!isSupabaseConfigured()) {
    throw new Error("createReply: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("createReply: no auth session");

  const trimmed = body.trim();
  if (!trimmed) throw new Error("Please write a reply first.");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("discussion_replies")
    .insert({
      discussion_id: discussionId,
      author_id: userId,
      body: trimmed,
    })
    .select(REPLIES_SELECT)
    .single();
  if (error) throw toFriendlyBodyError(error);

  return rowToReply(data as unknown as JoinedReplyRow);
}

/** Idempotent like — a repeat insert (23505) reads as already-liked. */
export async function likeDiscussion(discussionId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("likeDiscussion: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("discussion_likes")
    .insert({ user_id: userId, discussion_id: discussionId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unlikeDiscussion(discussionId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("unlikeDiscussion: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("discussion_likes")
    .delete()
    .eq("user_id", userId)
    .eq("discussion_id", discussionId);
  if (error) throw error;
}

export async function likeReply(replyId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("likeReply: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("discussion_reply_likes")
    .insert({ user_id: userId, reply_id: replyId });
  if (error && (error as { code?: string }).code !== "23505") throw error;
}

export async function unlikeReply(replyId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("unlikeReply: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("discussion_reply_likes")
    .delete()
    .eq("user_id", userId)
    .eq("reply_id", replyId);
  if (error) throw error;
}

/** Delete own thread (RLS allows author or admin; replies cascade). Chained
 *  .select() so an RLS-hidden row surfaces as a rejection, not silent success. */
export async function deleteDiscussion(discussionId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("deleteDiscussion: no auth session");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("module_discussions")
    .delete()
    .eq("id", discussionId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("deleteDiscussion: thread not found");
  }
}

export async function deleteReply(replyId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("deleteReply: no auth session");

  const supabase = createClient();
  const { data, error } = await supabase
    .from("discussion_replies")
    .delete()
    .eq("id", replyId)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error("deleteReply: reply not found");
  }
}
