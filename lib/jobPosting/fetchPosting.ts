/**
 * Server-side, SSRF-hardened fetch of a job-posting URL + extraction.
 *
 * This is the real network surface for the resume-tailoring feature, so it layers
 * every guard the events crawler uses plus the response-size cap the crawler
 * lacks:
 *   - `isPublicHttpUrl` before every hop (rejects non-http(s) + private/internal).
 *   - DNS resolution check: a hostname is resolved and EVERY resolved address is
 *     re-validated, so a public-looking name that maps to an internal/metadata
 *     address is rejected before we connect (the hostname-only guard in
 *     `_shared/ssrf.ts` — a Deno constraint — can't do this; Node can). A narrow
 *     active-rebinding TOCTOU window remains (undici re-resolves at connect); fully
 *     closing it needs a pinned-address dispatcher, a deliberate follow-up.
 *   - `redirect: 'manual'` with each redirect target RE-VALIDATED (a validated host
 *     can't 3xx us onto an internal one), capped at MAX_REDIRECTS hops; the redirect
 *     response body is cancelled before the next hop (undici connection hygiene).
 *   - `AbortController` timeout, and a streaming byte cap that aborts an oversized
 *     body mid-read instead of buffering it all.
 * Node runtime only (uses `node:dns/promises` + the Web Streams reader on `res.body`).
 */

import { lookup } from "node:dns/promises";
import { isPublicHttpUrl } from "@/lib/net/ssrf";
import { extractJobPosting, type ExtractedJobPosting } from "@/lib/jobPosting/extract";

export type FetchPostingErrorCode =
  | "invalid_url"
  | "blocked_url"
  | "fetch_failed"
  | "too_large"
  | "extraction_failed";

export type FetchPostingResult =
  | { ok: true; posting: ExtractedJobPosting & { url: string } }
  | { ok: false; error: FetchPostingErrorCode };

const TIMEOUT_MS = 10_000;
const MAX_BYTES = 2 * 1024 * 1024; // 2 MB
const MAX_REDIRECTS = 3;
const USER_AGENT = "UnifyResumeBot/1.0 (+https://unifysocial.ca)";

class TooLargeError extends Error {}

/** True for an IP-literal host (already fully validated by isPublicHttpUrl). */
function isIpLiteral(hostname: string): boolean {
  return hostname.startsWith("[") || /^\d{1,3}(\.\d{1,3}){3}$/.test(hostname);
}

/**
 * Resolve a DNS hostname and confirm EVERY answer is a public address — closes
 * the "public name → internal/metadata IP" hole the hostname-only guard leaves.
 * Reuses isPublicHttpUrl by probing each resolved literal. Fails closed on a
 * resolution error / empty answer.
 */
async function resolvesToPublic(hostname: string): Promise<boolean> {
  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return false;
  }
  if (!addrs.length) return false;
  return addrs.every(({ address, family }) =>
    isPublicHttpUrl(family === 6 ? `http://[${address}]/` : `http://${address}/`),
  );
}

/** Read a response body with a hard byte cap, aborting an oversized stream. */
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const body = res.body;
  if (!body) {
    const text = await res.text();
    if (new TextEncoder().encode(text).byteLength > maxBytes) throw new TooLargeError();
    return text;
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      try {
        await reader.cancel();
      } catch {
        /* already closing */
      }
      throw new TooLargeError();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return new TextDecoder("utf-8").decode(merged);
}

/**
 * Fetch + extract a job posting. `rawUrl` is validated (shape, scheme, SSRF)
 * before any network call, and again on every redirect hop.
 */
export async function fetchJobPosting(rawUrl: string): Promise<FetchPostingResult> {
  if (typeof rawUrl !== "string" || !rawUrl.trim()) return { ok: false, error: "invalid_url" };
  try {
    new URL(rawUrl); // shape check; SSRF/scheme validation follows
  } catch {
    return { ok: false, error: "invalid_url" };
  }
  if (!isPublicHttpUrl(rawUrl)) return { ok: false, error: "blocked_url" };

  let current = rawUrl;
  let html: string | null = null;

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Re-validate on every hop — a validated host must not 3xx us internal.
    if (!isPublicHttpUrl(current)) return { ok: false, error: "blocked_url" };
    // Resolve DNS names and re-validate every answer (IP literals are already
    // validated above), so a public name pointing at an internal IP is rejected.
    const host = new URL(current).hostname;
    if (!isIpLiteral(host) && !(await resolvesToPublic(host))) {
      return { ok: false, error: "blocked_url" };
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(current, {
        method: "GET",
        redirect: "manual",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
      });
    } catch {
      clearTimeout(timer);
      return { ok: false, error: "fetch_failed" };
    }

    // Manual redirect handling with re-validation on the next loop iteration.
    if (res.status >= 300 && res.status < 400) {
      // Cancel the unread body so undici returns the connection to the pool
      // before the next hop starts.
      try {
        await res.body?.cancel();
      } catch {
        /* already closing */
      }
      clearTimeout(timer);
      const loc = res.headers.get("location");
      if (!loc) return { ok: false, error: "fetch_failed" };
      try {
        current = new URL(loc, current).toString();
      } catch {
        return { ok: false, error: "fetch_failed" };
      }
      continue;
    }

    if (!res.ok) {
      try {
        await res.body?.cancel();
      } catch {
        /* already closing */
      }
      clearTimeout(timer);
      return { ok: false, error: "fetch_failed" };
    }

    try {
      html = await readCapped(res, MAX_BYTES);
    } catch (err) {
      if (err instanceof TooLargeError) return { ok: false, error: "too_large" };
      return { ok: false, error: "fetch_failed" };
    } finally {
      clearTimeout(timer);
    }
    break;
  }

  if (html === null) return { ok: false, error: "fetch_failed" }; // redirects exhausted

  const extracted = extractJobPosting(html);
  if (!extracted) return { ok: false, error: "extraction_failed" };
  return { ok: true, posting: { url: rawUrl, ...extracted } };
}
