import { NextResponse, type NextRequest } from "next/server";

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
 * Vercel Cron with `Authorization: Bearer $CRON_SECRET`; rejects anything else
 * so the endpoint can't be triggered publicly. Inert until the env vars
 * (SENTRY_API_TOKEN, POSTHOG_PROJECT_API_KEY, CRON_SECRET) are set in Vercel.
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

/** Count of currently-unresolved issues. Uses the `X-Hits` header Sentry sets on
 * the issues endpoint, falling back to the returned page length. */
async function fetchOpenIssueCount(token: string): Promise<number> {
  const url = `${SENTRY_API}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=is:unresolved&limit=100`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
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
  });
  if (!res.ok) {
    throw new Error(`Sentry stats ${res.status}: ${await res.text()}`);
  }
  // Response is [[unixTs, count], ...].
  const series = (await res.json()) as [number, number][];
  if (!Array.isArray(series)) return 0;
  return series.reduce((sum, point) => sum + (Number(point?.[1]) || 0), 0);
}

/** Fire-and-forget a server-side PostHog capture. No-ops if the key is unset. */
async function captureSnapshot(properties: Record<string, unknown>) {
  const apiKey = process.env.POSTHOG_PROJECT_API_KEY;
  if (!apiKey) {
    console.warn("sentry-snapshot: POSTHOG_PROJECT_API_KEY unset — skipping capture");
    return;
  }
  const res = await fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
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
}

export async function GET(req: NextRequest) {
  // Only Vercel Cron (or a caller holding CRON_SECRET) may run this.
  const cronSecret = process.env.CRON_SECRET;
  if (
    !cronSecret ||
    req.headers.get("authorization") !== `Bearer ${cronSecret}`
  ) {
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
    await captureSnapshot({
      open_issue_count: openIssueCount,
      errors_24h: errors24h,
    });
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
