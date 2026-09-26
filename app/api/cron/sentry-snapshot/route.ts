import { NextResponse, type NextRequest } from "next/server";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Daily Sentry → PostHog health snapshot (Vercel Cron; see vercel.json).
 *
 * Pulls two numbers from the Sentry REST API for the web project and fires a
 * single `sentry_snapshot` PostHog event so the "Unify Web — Weekly Review"
 * dashboard has a bugs/issues panel:
 *   - open_issue_count — unresolved issues seen in production
 *   - errors_24h       — production error events in the last 24h
 * Both are scoped to the `vercel-production` environment so local dev noise
 * (the `development` environment) doesn't inflate them.
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
// Numeric id of unify-web — the org-level events endpoint filters by id, not slug.
const SENTRY_PROJECT_ID = "4511606747037696";
// Only production counts; dev servers report as `development`.
const SENTRY_ENVIRONMENT = "vercel-production";

const POSTHOG_HOST =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://us.i.posthog.com";

// Per-request deadline for each outbound call so a stalled Sentry/PostHog can't
// burn the whole 30s function budget (Sentry calls run in parallel, then
// PostHog — worst case ~2× this, comfortably under maxDuration).
const FETCH_TIMEOUT_MS = 8000;

/** Constant-time bearer-token comparison (avoids CWE-208 timing leaks). Both
 * inputs are hashed to fixed-size digests so a length mismatch can't
 * short-circuit and reveal the secret's length. */
function safeEqual(a: string, b: string): boolean {
  const ah = createHash("sha256").update(a).digest();
  const bh = createHash("sha256").update(b).digest();
  return timingSafeEqual(ah, bh);
}

/** Count of unresolved production issues. Uses the `X-Hits` header Sentry sets on
 * the issues endpoint, falling back to the returned page length. */
async function fetchOpenIssueCount(token: string): Promise<number> {
  const query = encodeURIComponent(
    `is:unresolved environment:${SENTRY_ENVIRONMENT}`,
  );
  const url = `${SENTRY_API}/projects/${SENTRY_ORG}/${SENTRY_PROJECT}/issues/?query=${query}&limit=100`;
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

/** Production error events in the last 24h, from the org-level events endpoint
 * (the project `stats/` endpoint can't filter by environment). */
async function fetchErrors24h(token: string): Promise<number> {
  const params = new URLSearchParams({
    field: "count()",
    dataset: "errors",
    project: SENTRY_PROJECT_ID,
    environment: SENTRY_ENVIRONMENT,
    statsPeriod: "24h",
  });
  const url = `${SENTRY_API}/organizations/${SENTRY_ORG}/events/?${params}`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Sentry events ${res.status}: ${await res.text()}`);
  }
  // Response is { data: [{ "count()": n }], meta: … }.
  const body = (await res.json()) as { data?: Record<string, unknown>[] };
  return Number(body.data?.[0]?.["count()"]) || 0;
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
    console.warn(
      "sentry-snapshot: POSTHOG_PROJECT_API_KEY unset — skipping capture",
    );
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
    console.error(
      "sentry-snapshot: CRON_SECRET not configured; refusing to run",
    );
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
      environment: SENTRY_ENVIRONMENT,
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
