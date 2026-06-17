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

type ModerationBody =
  | { action: "block"; blockedUserId: string }
  | { action: "report-post"; postId: number; reason: string }
  | { action: "report-user"; userId: string; reason: string };

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: ModerationBody;
  try {
    body = (await req.json()) as ModerationBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  let slug: string;
  let payload: Record<string, unknown>;
  switch (body.action) {
    case "block":
      slug = "block-user";
      payload = { blockedUserId: body.blockedUserId };
      break;
    case "report-post":
      slug = "report-post";
      payload = { postId: body.postId, reason: body.reason };
      break;
    case "report-user":
      slug = "report-user";
      payload = { userId: body.userId, reason: body.reason };
      break;
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
    return NextResponse.json({ error: message }, { status: 502 });
  }

  // The edge fn returns { success, error? } at HTTP 200.
  return NextResponse.json(data ?? { success: false, error: "Empty response" });
}
