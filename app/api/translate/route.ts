import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { isSupportedLanguage } from "@/lib/i18n/config";

/**
 * Server-side proxy for the web-owned `translate-content` edge function
 * (on-demand cached translation of posts/comments — i18n Phase 2).
 *
 * Same-origin POST → server→server `functions.invoke` (no CORS preflight),
 * forwarding the user's JWT from cookies so the function identifies the user
 * and enforces the daily quota. Mirrors /api/moderation + /api/companion
 * (Node runtime). The 429 daily-limit response is preserved verbatim (status +
 * error body) so the client can distinguish "limit reached" from a hard
 * failure.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

interface TranslateBody {
  type: "post" | "comment";
  id: number;
  targetLanguage: string;
}

function parseBody(raw: unknown): TranslateBody | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.type !== "post" && rec.type !== "comment") return null;
  // posts.id / post_comments.id are integer serials on the shared DB.
  if (
    typeof rec.id !== "number" ||
    !Number.isInteger(rec.id) ||
    rec.id <= 0
  ) {
    return null;
  }
  if (!isSupportedLanguage(rec.targetLanguage)) return null;
  return { type: rec.type, id: rec.id, targetLanguage: rec.targetLanguage };
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: TranslateBody | null;
  try {
    body = parseBody(await req.json());
  } catch {
    body = null;
  }
  if (!body) {
    return NextResponse.json(
      { error: "Expected { type: 'post'|'comment', id, targetLanguage }" },
      { status: 400 },
    );
  }

  const { data, error } = await supabase.functions.invoke("translate-content", {
    body,
  });

  if (error) {
    // FunctionsHttpError carries the upstream Response on `.context` — preserve
    // its status (especially the 429 daily-limit) and JSON error body.
    let status = 502;
    let message = error.message || "Translation request failed.";
    let code: string | undefined;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === "number") {
      status = ctx.status;
      if (typeof ctx.json === "function") {
        try {
          const j = (await ctx.json()) as { error?: string; code?: string };
          if (j?.error) message = j.error;
          if (j?.code) code = j.code;
        } catch {
          // non-JSON error body — keep the generic message
        }
      }
    }
    return NextResponse.json(
      { error: message, ...(code ? { code } : {}) },
      { status },
    );
  }

  // The edge fn sets Content-Type: application/json, so `data` arrives parsed;
  // guard the string case defensively if the header is ever dropped.
  let result: unknown = data;
  if (typeof data === "string") {
    try {
      result = JSON.parse(data);
    } catch {
      return NextResponse.json(
        { error: "Unexpected response" },
        { status: 502 },
      );
    }
  }
  return NextResponse.json(result ?? { error: "Empty response" });
}
