import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import type { FollowListUser } from "@/types";

/**
 * Block / report data access (users + posts).
 *
 * Runs against the shared production DB (`wrbauxutkysljmsqojts`, web + mobile),
 * whose `blocked_users` / `post_report` / `user_reports` tables and the
 * `block-user` / `report-post` / `report-user` edge functions already exist and
 * are the same ones the mobile app uses. We therefore mirror mobile's service
 * split: **block + report go through the edge functions** (they insert the row
 * *and* email moderators via Resend), while **unblock + reads are direct table
 * ops** (own-row RLS allows them). The browser Supabase client attaches the
 * user's JWT to `functions.invoke` automatically.
 *
 * Follows the Community wiring pattern: `isSupabaseConfigured()` +
 * `getAuthUserId()` guards, snake_case rows, no-op / empty fallback when the env
 * isn't configured (local-dev case).
 */

const MIN_REASON = 5;
const MAX_REASON = 500;

/** Shape returned by block-user / report-post / report-user (HTTP 200 even on
 *  failure, with `success:false` + an `error` string). */
interface ModerationFnResponse {
  success: boolean;
  error?: string;
}

/** Throw unless the edge function reported success, treating the listed
 *  idempotent outcomes (e.g. "Already blocked") as benign no-ops. */
function assertFnSuccess(
  data: ModerationFnResponse | null,
  fallback: string,
  benign: string[] = [],
): void {
  if (data?.success) return;
  const err = data?.error;
  if (err && benign.includes(err)) return;
  throw new Error(err ?? fallback);
}

/** Trim + length-validate a report reason (matches the edge functions' 5–500). */
function validateReason(reason: string): string {
  const trimmed = reason.trim();
  if (trimmed.length < MIN_REASON) {
    throw new Error(
      `Please provide a short reason (min ${MIN_REASON} characters).`,
    );
  }
  return trimmed.slice(0, MAX_REASON);
}

/**
 * POST to the same-origin /api/moderation proxy, which forwards to the
 * block-user / report-post / report-user edge functions server-side. The
 * browser can't call those functions directly (they have no CORS handling, so
 * the preflight is rejected), so the proxy avoids the CORS preflight while
 * keeping the moderator email. Returns the edge fn's { success, error? }; throws
 * on a transport/proxy failure.
 */
async function callModeration(
  body: Record<string, unknown>,
): Promise<ModerationFnResponse> {
  const res = await fetch("/api/moderation", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  // The edge fn's body can arrive as a JSON string (text/plain Content-Type) and
  // even double-encoded through the proxy, so parse defensively until we have an
  // object — otherwise `data.success` reads as undefined and a genuine success
  // is mis-reported as a failure.
  let parsed: unknown = await res.json().catch(() => null);
  if (typeof parsed === "string") {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      // leave as the raw string — handled as a non-object below
    }
  }
  const data =
    parsed && typeof parsed === "object"
      ? (parsed as ModerationFnResponse & { error?: string })
      : null;
  if (!res.ok) {
    throw new Error(data?.error ?? "Moderation request failed.");
  }
  return data ?? { success: false, error: "Empty response" };
}

/* ---- Block reads ------------------------------------------------------- */

/** UUIDs the signed-in user has blocked (own-row RLS). Empty pre-config. */
export async function getBlockedUserIds(): Promise<string[]> {
  if (!isSupabaseConfigured()) return [];
  const userId = await getAuthUserId();
  if (!userId) return [];

  const supabase = createClient();
  const { data, error } = await supabase
    .from("blocked_users")
    .select("blocked_id")
    .eq("blocker_id", userId);
  if (error) throw error;

  return (data ?? []).map((r) => r.blocked_id as string);
}

/**
 * The signed-in user's blocked accounts with display info (newest block first),
 * for the Settings management list. Resolved in two steps because
 * `blocked_users.blocked_id` FKs `auth.users` (not `public.users`), so PostgREST
 * can't embed the public profile directly.
 */
export async function getBlockedUsers(): Promise<FollowListUser[]> {
  if (!isSupabaseConfigured()) return [];
  const userId = await getAuthUserId();
  if (!userId) return [];

  const supabase = createClient();
  const { data: blocks, error: blocksErr } = await supabase
    .from("blocked_users")
    .select("blocked_id, created_at")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false });
  if (blocksErr) throw blocksErr;

  const ids = (blocks ?? []).map((b) => b.blocked_id as string);
  if (ids.length === 0) return [];

  const { data: users, error: usersErr } = await supabase
    .from("users")
    .select("id, username, profile_picture_url")
    .in("id", ids);
  if (usersErr) throw usersErr;

  // Index the joined rows, then re-emit in block-recency order from `ids`.
  const byId = new Map<string, FollowListUser>(
    (users ?? []).map((u) => [
      u.id as string,
      {
        id: u.id as string,
        username: u.username as string,
        profilePictureUrl: (u.profile_picture_url as string | null) ?? null,
      },
    ]),
  );
  return ids
    .map((id) => byId.get(id))
    .filter((u): u is FollowListUser => Boolean(u));
}

/** Whether the signed-in user has blocked `blockedId`. */
export async function isUserBlocked(blockedId: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;
  const userId = await getAuthUserId();
  if (!userId) return false;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("blocked_users")
    .select("id")
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId)
    .maybeSingle();
  if (error) throw error;

  return Boolean(data);
}

/* ---- Block / unblock mutations ---------------------------------------- */

export async function blockUser(blockedUserId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("blockUser: no auth session");
  if (userId === blockedUserId) throw new Error("You can't block yourself.");

  const data = await callModeration({ action: "block", blockedUserId });
  assertFnSuccess(data, "Failed to block user.", ["Already blocked"]);
}

export async function unblockUser(blockedId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;
  const userId = await getAuthUserId();
  if (!userId) throw new Error("unblockUser: no auth session");

  const supabase = createClient();
  const { error } = await supabase
    .from("blocked_users")
    .delete()
    .eq("blocker_id", userId)
    .eq("blocked_id", blockedId);
  if (error) throw error;
}

/* ---- Report mutations -------------------------------------------------- */

export async function reportPost(
  postId: number,
  reason: string,
): Promise<void> {
  const trimmed = validateReason(reason);
  if (!isSupabaseConfigured()) return;

  const data = await callModeration({
    action: "report-post",
    postId,
    reason: trimmed,
  });
  assertFnSuccess(data, "Failed to submit report.", ["Already reported"]);
}

export async function reportUser(
  reportedUserId: string,
  reason: string,
): Promise<void> {
  const trimmed = validateReason(reason);
  if (!isSupabaseConfigured()) return;

  const data = await callModeration({
    action: "report-user",
    userId: reportedUserId,
    reason: trimmed,
  });
  assertFnSuccess(data, "Failed to submit report.", ["Already reported"]);
}
