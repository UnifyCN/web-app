import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Same-origin proxy for the `companion-actions` edge function (task state,
 * result lookup and Undo; mobile-app#361). The browser posts here; this route
 * forwards the body with the user's JWT from cookies through a server→server
 * `functions.invoke`, so there is no browser preflight. The function derives the
 * account from that JWT and never trusts a client-supplied owner.
 *
 * Status codes and JSON bodies pass through verbatim: the client needs 409
 * conflict details, 426 version ranges and 503 retry hints to show the true
 * outcome. A failure to reach the function is a 502 with no body detail, which
 * the client treats as an unknown outcome and looks up before any retry.
 * Never calls rag-query or the AI-generation quota.
 */
export const runtime = "nodejs";
export const maxDuration = 20;

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return NextResponse.json({ error: "invalid_request" }, { status: 400 });
  }

  const { data, error } = await supabase.functions.invoke("companion-actions", {
    body: body as Record<string, unknown>,
  });

  if (error) {
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.status === "number") {
      let upstream: unknown = { error: "upstream_error" };
      try {
        upstream = await ctx.json();
      } catch {
        // non-JSON body: keep the generic error
      }
      const headers: Record<string, string> = {};
      const retryAfter = ctx.headers?.get?.("retry-after");
      if (retryAfter) headers["retry-after"] = retryAfter;
      return NextResponse.json(upstream, { status: ctx.status, headers });
    }
    return NextResponse.json(
      { error: "upstream_unreachable" },
      { status: 502 },
    );
  }

  let result: unknown = data;
  if (typeof data === "string") {
    try {
      result = JSON.parse(data);
    } catch {
      return NextResponse.json({ error: "upstream_error" }, { status: 502 });
    }
  }
  return NextResponse.json(result ?? {}, {
    headers: { "cache-control": "no-store" },
  });
}
