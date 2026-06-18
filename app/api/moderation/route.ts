import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side proxy for the block / report edge functions.
 *
 * The browser can't call `block-user` / `report-post` / `report-user` directly:
 * those functions (mobile-owned, on the shared project) have no CORS handling,
 * so a browser preflight (OPTIONS) is rejected with 400 and the call never
 * fires. The browser instead POSTs to this same-origin route, and the route
 * does a server→server `functions.invoke` — no CORS preflight — while still
 * forwarding the user's JWT (from cookies) so the edge fn identifies the
 * reporter/blocker and emails moderators. Node runtime to match /api/storage.
 */
export const runtime = "nodejs";
export const maxDuration = 10;

// Mirror the service-side reason bounds (services/moderation.ts) and the edge
// functions' own 5–500 validation.
const MIN_REASON = 5;
const MAX_REASON = 500;

function isObject(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function asNonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function asReason(value: unknown): string | null {
  const reason = asNonEmptyString(value);
  if (!reason || reason.length < MIN_REASON || reason.length > MAX_REASON) {
    return null;
  }
  return reason;
}

/** Whether an upstream error/body looks like a unique-constraint duplicate, i.e.
 *  the new post_report UNIQUE(reporter_id, post_id) firing on a repeat report. */
function isDuplicateConstraint(text: string | undefined): boolean {
  return Boolean(text) && /23505|duplicate key|unique constraint/i.test(text!);
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!isObject(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  // The browser sends snake_case (services/moderation.ts); also accept camelCase
  // for backwards compatibility. The edge functions themselves read camelCase,
  // so this route stays the snake_case → camelCase translation layer.
  let slug: string;
  let payload: Record<string, unknown>;
  switch (body.action) {
    case "block": {
      const blockedUserId = asNonEmptyString(
        body.blocked_user_id ?? body.blockedUserId,
      );
      if (!blockedUserId) {
        return NextResponse.json(
          { error: "Missing blocked user." },
          { status: 400 },
        );
      }
      if (blockedUserId === user.id) {
        return NextResponse.json(
          { error: "You can't block yourself." },
          { status: 400 },
        );
      }
      slug = "block-user";
      payload = { blockedUserId };
      break;
    }
    case "report-post": {
      const postId = body.post_id ?? body.postId;
      const reason = asReason(body.reason);
      if (
        typeof postId !== "number" ||
        !Number.isInteger(postId) ||
        postId <= 0 ||
        !reason
      ) {
        return NextResponse.json(
          { error: "Invalid post report." },
          { status: 400 },
        );
      }
      // Self-report guard (mirrors block / report-user). The post author isn't in
      // the request body, so look it up; posts are world-readable under RLS.
      // Fail-closed: if the lookup errors or the post is missing, reject rather
      // than letting an unverifiable report through.
      const { data: post, error: postErr } = await supabase
        .from("posts")
        .select("user_id")
        .eq("id", postId)
        .maybeSingle();
      if (postErr || !post) {
        return NextResponse.json(
          { error: "Could not verify post ownership." },
          { status: 400 },
        );
      }
      if (post.user_id === user.id) {
        return NextResponse.json(
          { error: "Cannot report your own post." },
          { status: 400 },
        );
      }
      slug = "report-post";
      payload = { postId, reason };
      break;
    }
    case "report-user": {
      const reportedUserId = asNonEmptyString(body.user_id ?? body.userId);
      const reason = asReason(body.reason);
      if (!reportedUserId || !reason) {
        return NextResponse.json(
          { error: "Invalid user report." },
          { status: 400 },
        );
      }
      if (reportedUserId === user.id) {
        return NextResponse.json(
          { error: "You can't report yourself." },
          { status: 400 },
        );
      }
      slug = "report-user";
      payload = { userId: reportedUserId, reason };
      break;
    }
    default:
      return NextResponse.json({ error: "Unknown action" }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke(slug, {
    body: payload,
  });

  if (error) {
    // FunctionsHttpError carries the upstream Response on `.context` (e.g. the
    // function's 500 "Missing Resend env vars").
    let message = error.message || "Moderation request failed.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      try {
        const j = (await ctx.json()) as { error?: string };
        if (j?.error) message = j.error;
      } catch {
        // non-JSON error body — keep the generic message
      }
    }
    // A repeat report can surface as the post_report UNIQUE constraint firing
    // upstream. Don't turn that into a 502 the client treats as a transport
    // failure — normalize it to a benign success so the report reads as a no-op.
    if (isDuplicateConstraint(message)) {
      return NextResponse.json({ success: true });
    }
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // The edge fns return their JSON body with a text/plain Content-Type (they
  // don't set application/json), so supabase-js hands `data` back as a raw
  // STRING. Normalize to an object so the client gets a real { success, error? }
  // instead of an unparsed string (whose `.success` would read as undefined).
  let result: unknown = data;
  if (typeof data === "string") {
    try {
      result = JSON.parse(data);
    } catch {
      result = { success: false, error: data || "Unexpected response" };
    }
  }
  // Same duplicate normalization for the 200-with-{success:false} shape, in case
  // the edge fn reports the unique violation in its JSON body instead of erroring.
  if (
    isObject(result) &&
    result.success === false &&
    isDuplicateConstraint(typeof result.error === "string" ? result.error : undefined)
  ) {
    return NextResponse.json({ success: true });
  }
  return NextResponse.json(result ?? { success: false, error: "Empty response" });
}
