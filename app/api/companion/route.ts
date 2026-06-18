import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Server-side proxy for the `rag-query` edge function (AI Companion replies).
 *
 * The deployed `rag-query` function (mobile-owned, on the shared project) sets
 * no CORS headers and never answers the OPTIONS preflight, so a browser call via
 * `supabase.functions.invoke` is rejected before the function ever runs. The
 * browser instead POSTs to this same-origin route, which does a server→server
 * `functions.invoke` (no preflight) while forwarding the user's JWT (from
 * cookies) so the function identifies the user, enforces the daily quota, and
 * logs usage. Mirrors /api/moderation + /api/storage (Node runtime).
 *
 * The 429 daily-limit response is preserved verbatim (status + error body) so
 * the client can raise a ChatLimitError; other upstream errors are forwarded
 * with their status. maxDuration is higher than the other proxies because
 * rag-query runs an embedding lookup + an LLM completion (with retries).
 */
export const runtime = "nodejs";
export const maxDuration = 60;

interface RagQueryBody {
  prompt: string;
  conversationIdentifier: string;
  messages?: { role: "user" | "assistant"; message: string }[];
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: RagQueryBody;
  try {
    body = (await req.json()) as RagQueryBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  if (!body?.prompt || typeof body.prompt !== "string" || !body.prompt.trim()) {
    return NextResponse.json({ error: "Prompt is required" }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke("rag-query", {
    body: {
      prompt: body.prompt,
      conversationIdentifier: body.conversationIdentifier,
      messages: body.messages ?? [],
    },
  });

  if (error) {
    // FunctionsHttpError carries the upstream Response on `.context` — preserve
    // its status (especially the 429 daily-limit) and JSON error body so the
    // client can distinguish "limit reached" from a hard failure.
    let status = 502;
    let message = error.message || "AI request failed.";
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === "number") {
      status = ctx.status;
      if (typeof ctx.json === "function") {
        try {
          const j = (await ctx.json()) as { error?: string };
          if (j?.error) message = j.error;
        } catch {
          // non-JSON error body — keep the generic message
        }
      }
    }
    return NextResponse.json({ error: message }, { status });
  }

  // rag-query (non-streaming) returns its body with an application/json
  // Content-Type, so supabase-js hands `data` back already parsed. Pass it
  // through; guard the string case defensively in case the header is dropped.
  let result: unknown = data;
  if (typeof data === "string") {
    try {
      result = JSON.parse(data);
    } catch {
      result = { answer: data };
    }
  }
  return NextResponse.json(result ?? {});
}
