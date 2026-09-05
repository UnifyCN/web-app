import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { fetchJobPosting, type FetchPostingErrorCode } from "@/lib/jobPosting/fetchPosting";
import { extractTitleFromText, normalizeJobText } from "@/lib/jobPosting/extract";
import { MAX_JOB_POSTING_LEN, RESUME_DAILY_MESSAGE_LIMIT } from "@/lib/resume/schema";

/**
 * Server-side fetch + extraction of a job posting for the resume-tailoring
 * feature. Runs in the Node runtime so it can use the streaming byte cap in
 * `fetchJobPosting`. Two inputs:
 *   - `{ url }`  → SSRF-guarded server fetch + HTML extraction (never client-side,
 *      so the user's IP is never exposed and internal hosts are unreachable).
 *   - `{ text }` → the user pasted the description directly (no network, no SSRF
 *      surface); just normalize it. This is the graceful fallback for the many job
 *      sites that block scraping or require JS/login.
 *
 * Quota: this route does NOT charge the resume quota (the service-role RPC isn't
 * callable here) — it soft-gates on the user's remaining daily budget and returns
 * 429 when they're out. The tailoring turn that follows is what actually charges
 * `check_and_increment_resume_usage` (60/day) via the resume-chat edge fn.
 */
export const runtime = "nodejs";
export const maxDuration = 30;

const MAX_URL_LEN = 2048;
const MAX_PASTE_LEN = 20_000; // raw paste cap before normalization/truncation
const MIN_TEXT_LEN = 40; // below this there's nothing to tailor against

// Lightweight in-memory per-user rate limit for outbound fetches. Fluid Compute
// reuses instances, so this throttles burst abuse cheaply. It is NOT durable
// across instances — a fully durable per-fetch quota would need a dedicated
// table/RPC (a schema change, deliberately deferred). The soft daily gate below
// and the SSRF/size/timeout caps in fetchJobPosting bound the rest.
const FETCH_WINDOW_MS = 60_000;
const FETCH_MAX_PER_WINDOW = 12;
const fetchHits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
  const now = Date.now();
  const cutoff = now - FETCH_WINDOW_MS;
  const hits = (fetchHits.get(userId) ?? []).filter((t) => t > cutoff);
  if (hits.length >= FETCH_MAX_PER_WINDOW) {
    fetchHits.set(userId, hits);
    return true;
  }
  hits.push(now);
  fetchHits.set(userId, hits);
  // Bound the map so a churn of users can't grow it without limit.
  if (fetchHits.size > 5000) {
    for (const [k, v] of fetchHits) {
      if (v.every((t) => t <= cutoff)) fetchHits.delete(k);
    }
  }
  return false;
}

type JobPostingErrorCode =
  | FetchPostingErrorCode
  | "daily_limit_reached"
  | "rate_limited";

function statusFor(code: JobPostingErrorCode): number {
  switch (code) {
    case "daily_limit_reached":
    case "rate_limited":
      return 429;
    case "too_large":
      return 413;
    case "invalid_url":
    case "blocked_url":
      return 400;
    case "fetch_failed":
    case "extraction_failed":
    default:
      return 422; // reached-but-unusable content
  }
}

// English fallbacks; the client maps `code` to a localized message.
function messageFor(code: JobPostingErrorCode): string {
  switch (code) {
    case "daily_limit_reached":
      return "Daily resume-builder limit reached.";
    case "rate_limited":
      return "You're doing that too quickly. Please wait a moment and try again.";
    case "too_large":
      return "That page is too large to read.";
    case "invalid_url":
      return "That doesn't look like a valid link.";
    case "blocked_url":
      return "That link can't be opened for security reasons.";
    case "extraction_failed":
      return "Couldn't find a job posting on that page.";
    case "fetch_failed":
    default:
      return "Couldn't open that job posting.";
  }
}

function fail(code: JobPostingErrorCode): NextResponse {
  return NextResponse.json({ error: messageFor(code), code }, { status: statusFor(code) });
}

/**
 * True when the user has already hit today's resume-message cap. Reads the
 * `resume_usage` row directly (RLS select-own) and mirrors the RPC's UTC-day
 * rollover. Fails OPEN on a read error — the hard cap is still enforced by the
 * edge fn on the tailoring turn, so a transient read glitch shouldn't block a fetch.
 */
async function isOverDailyLimit(
  supabase: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const { data, error } = await supabase
    .from("resume_usage")
    .select("message_count, last_message_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error || !data) return false;
  const last = data.last_message_at as string | null;
  const today = new Date().toISOString().slice(0, 10);
  const sameDay = !!last && new Date(last).toISOString().slice(0, 10) === today;
  const count = sameDay ? ((data.message_count as number) ?? 0) : 0;
  return count >= RESUME_DAILY_MESSAGE_LIMIT;
}

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized", code: "unauthorized" }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    const parsed = await req.json();
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return fail("invalid_url");
    }
    body = parsed as Record<string, unknown>;
  } catch {
    return fail("invalid_url");
  }

  const url = typeof body.url === "string" ? body.url.trim() : "";
  const pasteText = typeof body.text === "string" ? body.text : "";

  if (await isOverDailyLimit(supabase, user.id)) {
    return fail("daily_limit_reached");
  }

  // Paste path — no network, no SSRF surface.
  if (!url && pasteText) {
    const text = normalizeJobText(pasteText.slice(0, MAX_PASTE_LEN)).slice(0, MAX_JOB_POSTING_LEN);
    if (text.trim().length < MIN_TEXT_LEN) return fail("extraction_failed");
    return NextResponse.json({
      url: "",
      title: extractTitleFromText(text),
      company: "",
      location: "",
      text,
    });
  }

  if (!url) return fail("invalid_url");
  if (url.length > MAX_URL_LEN) return fail("invalid_url");

  // Burst throttle before making an outbound request.
  if (rateLimited(user.id)) return fail("rate_limited");

  const result = await fetchJobPosting(url);
  if (!result.ok) return fail(result.error);

  return NextResponse.json({
    ...result.posting,
    text: result.posting.text.slice(0, MAX_JOB_POSTING_LEN),
  });
}
