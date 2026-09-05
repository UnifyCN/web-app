import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { MAX_COVER_LETTER_MESSAGE_LEN } from "@/lib/coverLetter/schema";

/**
 * Server-side proxy for the shared `cover-letter-chat` edge function (AI
 * Cover-Letter Generator turns). The browser POSTs to this same-origin route,
 * which does a server→server `functions.invoke` (no preflight) forwarding the
 * user's JWT (from cookies) so the function identifies the user, enforces the
 * daily quota (check_and_increment_cover_letter_usage), and generates the turn.
 * `source: "web"` tags the request for the function's $ai_generation analytics.
 * Mirrors /api/resume → resume-chat.
 *
 * The edge function re-validates the JWT and clamps message/history/letter/
 * profile itself, so this route only auth-gates + does a cheap message check
 * before forwarding. The upstream status (especially the 429 daily-limit and a
 * 503/504 "busy") is preserved so the client can raise the right error.
 */
export const runtime = "nodejs";
export const maxDuration = 60;

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
    // `null`, arrays, and primitives parse as valid JSON but aren't request
    // objects — reject them with a 400 instead of forwarding junk.
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const message = typeof body.message === "string" ? body.message.trim() : "";
  if (!message) {
    return NextResponse.json({ error: "Message is required" }, { status: 400 });
  }
  if (message.length > MAX_COVER_LETTER_MESSAGE_LEN) {
    return NextResponse.json({ error: "Message is too long" }, { status: 413 });
  }

  const { data, error } = await supabase.functions.invoke("cover-letter-chat", {
    body: {
      message,
      history: body.history ?? [],
      currentCoverLetter: body.currentCoverLetter ?? {},
      resumeContext: body.resumeContext ?? "",
      jobPosting: body.jobPosting ?? null,
      todayDate: body.todayDate ?? "",
      profile: body.profile ?? {},
      source: "web",
    },
  });

  if (error) {
    // FunctionsHttpError carries the upstream Response on `.context` — preserve
    // its status (429 daily-limit, 503/504 busy) and JSON error body so the
    // client can distinguish "limit reached" / "busy" from a hard failure.
    let status = 502;
    let errorBody: Record<string, unknown> = {
      error: error.message || "The cover-letter assistant is busy. Please try again.",
    };
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === "number") {
      status = ctx.status;
      if (typeof ctx.json === "function") {
        try {
          const j: unknown = await ctx.json();
          // Preserve the edge fn's full error contract (e.g. `code`).
          if (j && typeof j === "object" && !Array.isArray(j)) {
            errorBody = j as Record<string, unknown>;
          }
        } catch {
          // non-JSON error body — keep the generic message
        }
      }
    }
    return NextResponse.json(errorBody, { status });
  }

  // cover-letter-chat returns a non-streaming application/json body, so
  // supabase-js hands `data` back already parsed; guard the string case.
  let result: unknown = data;
  if (typeof data === "string") {
    try {
      result = JSON.parse(data);
    } catch {
      result = {};
    }
  }
  return NextResponse.json(result ?? {});
}
