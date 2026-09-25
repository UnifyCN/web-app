import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";

/**
 * Daily Sentry → PostHog health snapshot (Vercel Cron; see vercel.json).
 *
 * Pulls two numbers from the Sentry REST API for the web project and fires a
 * single `sentry_snapshot` PostHog event so the "Unify Web — Weekly Review"
 * dashboard has a bugs/issues panel:
 *   - open_issue_count — currently unresolved issues
 *   - errors_24h       — error events received in the last 24h
 *
 * Self-contained in the web-app repo (no shared Supabase infra). Invoked by
 * Vercel Cron with `Authorization: Bearer $CRON_SECRET`; any other caller gets a
 * 401, and an unset CRON_SECRET is a 500. proxy.ts exempts /api/cron/ from the
 * auth gate, so this check is the ONLY thing protecting the endpoint. Inert until
 * the env vars (SENTRY_API_TOKEN, POSTHOG_PROJECT_API_KEY, CRON_SECRET) are set
 * in Vercel.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

// Sentry org/project are fixed for this app (per the weekly-review ask).
const SENTRY_ORG = "unify-kv";
const SENTRY_PROJECT = "unify-web";
const SENTRY_API = "https://sentry.io/api/0";

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

// Per-request deadline for each outbound call so a stalled Sentry/PostHog can't
// burn the whole 30s function budget (Sentry calls run in parallel, then
// PostHog — worst case ~2× this, comfortably under maxDuration).
const FETCH_TIMEOUT_MS = 8000;

/** Constant-time bearer-token comparison (avoids CWE-208 timing leaks). */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** Count of currently-unresolved issues. Uses the `X-Hits` header Sentry sets on
 * the issues endpoint, falling back to the returned page length. */
async function fetchOpenIssueCount(token: string): Promise<number> {
  const url = `${SENTRY_API}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved&limit=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Sentry issues ${res.status}: ${await res.text()}`);
  }
  const hits = res.headers.get("X-Hits");
  if (hits !== null && hits !== "") {
    const n = Number(hits);
    if (Number.isFinite(n)) return n;
  }
  const issues = (await res.json()) as unknown[];
  return Array.isArray(issues) ? issues.length : 0;
}

/** Error events received in the last 24h, summed from the project stats series. */
async function fetchErrors24h(token: string): Promise<number> {
  const until = Math.floor(Date.now() / 1000);
  const since = until - 24 * 60 * 60;
  const url = `${SENTRY_API}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/stats/?stat=received&resolution=1h&since=${since}&until=${until}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Sentry stats ${res.status}: ${await res.text()}`);
  }
  // Response is [[unixTs, count], ...].
  const series = (await res.json()) as [number, number][];
  if (!Array.isArray(series)) return 0;
  return series.reduce((sum, point) => sum + (Number(point?.[1]) || 0), 0);
}

/**
 * Server-side PostHog capture. Returns "skipped" (not an error) when the project
 * key is unset so the caller can surface a non-healthy status — a misconfigured
 * cron must not report success while the dashboard gets no data.
 */
async function captureSnapshot(
  properties: Record<string, unknown>,
): Promise<"sent" | "skipped"> {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) {
    console.warn("sentry-snapshot: POSTHOG_PROJECT_API_KEY unset — skipping capture");
    return "skipped";
  }
  const res = await fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    body: JSON.stringify({
      api_key: apiKey,
      event: "sentry_snapshot",
      distinct_id: "system:sentry-cron",
      properties: { ...properties, platform: "web", $lib: "vercel-cron" },
    }),
  });
  if (!res.ok) {
    throw new Error(`PostHog capture ${res.status}: ${await res.text()}`);
  }
  return "sent";
}

export async function GET(req: NextRequest) {
  // Only Vercel Cron (or a caller holding CRON_SECRET) may run this. Compared in
  // constant time to avoid leaking the secret via response timing.
  // A missing secret is a server misconfiguration, not a bad caller: fail loudly
  // with a 500 and never compare against an unset value ("Bearer undefined").
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    console.error("sentry-snapshot: CRON_SECRET not configured; refusing to run");
    return NextResponse.json(
      { error: "CRON_SECRET not configured" },
      { status: 500 },
    );
  }
  const authHeader = req.headers.get("authorization");
  if (!authHeader || !safeEqual(authHeader, `Bearer ${cronSecret}`)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const sentryToken = process.env.SENTRY_API_TOKEN;
  if (!sentryToken) {
    return NextResponse.json(
      { error: "SENTRY_API_TOKEN not configured" },
      { status: 500 },
    );
  }

  try {
    const [openIssueCount, errors24h] = await Promise.all([
      fetchOpenIssueCount(sentryToken),
      fetchErrors24h(sentryToken),
    ]);
    const capture = await captureSnapshot({
      open_issue_count: openIssueCount,
      errors_24h: errors24h,
    });
    if (capture === "skipped") {
      // Metrics were fetched but no event was recorded — the cron is
      // misconfigured, so report a non-2xx status rather than a healthy ok.
      return NextResponse.json(
        {
          ok: false,
          skipped: "POSTHOG_PROJECT_API_KEY not configured",
          open_issue_count: openIssueCount,
          errors_24h: errors24h,
        },
        { status: 503 },
      );
    }
    return NextResponse.json({
      ok: true,
      open_issue_count: openIssueCount,
      errors_24h: errors24h,
    });
  } catch (err) {
    console.error("sentry-snapshot: failed", err);
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : "unknown" },
      { status: 502 },
    );
  }
}
