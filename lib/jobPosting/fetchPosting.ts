/**
 * Server-side, SSRF-hardened fetch of a job-posting URL + extraction.
 *
 * This is the real network surface for the resume-tailoring feature, and the
 * fetched content is returned to the caller, so it's a full SSRF-read surface —
 * hardened accordingly:
 *   - `isPublicHttpUrl` before every hop (rejects non-http(s) + private/internal),
 *     re-run on each redirect target (a validated host can't 3xx us internal).
 *   - **Connection pinning.** The hostname is resolved once, EVERY answer is
 *     validated as public, and the connection is pinned to that validated address
 *     via `node:http(s)`'s `lookup` option — so the request cannot re-resolve to a
 *     different (internal) address between check and connect. This closes the
 *     DNS-rebinding TOCTOU the hostname-only guard in `_shared/ssrf.ts` (a Deno
 *     constraint) leaves open. TLS SNI + the Host header stay the real hostname,
 *     so certificate validation is unaffected.
 *   - Per-request deadline (AbortController) and a streaming byte cap that destroys
 *     an oversized response mid-read instead of buffering it.
 * Node runtime only.
 */

import { request as httpsRequest } from "node:https";
import { request as httpRequest } from "node:http";
import { lookup } from "node:dns/promises";
import { isIP } from "node:net";
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

interface PinnedAddr {
  address: string;
  family: number;
}

/**
 * Resolve `hostname` to a single validated PUBLIC address to pin the connection
 * to. An IP-literal host is already validated by isPublicHttpUrl and pins to
 * itself. A DNS name is resolved and EVERY answer must be public (fail closed on
 * a mixed/internal/empty/failed answer); the first is pinned.
 */
async function resolvePinned(hostname: string): Promise<PinnedAddr | null> {
  const bare =
    hostname.startsWith("[") && hostname.endsWith("]")
      ? hostname.slice(1, -1)
      : hostname;
  const literal = isIP(bare);
  if (literal !== 0) return { address: bare, family: literal };

  let addrs: { address: string; family: number }[];
  try {
    addrs = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return null;
  }
  if (!addrs.length) return null;
  for (const a of addrs) {
    if (!isPublicHttpUrl(a.family === 6 ? `http://[${a.address}]/` : `http://${a.address}/`)) {
      return null;
    }
  }
  return { address: addrs[0].address, family: addrs[0].family };
}

interface RawResponse {
  status: number;
  location: string | null;
  body: string | null;
  tooLarge: boolean;
}

/**
 * One GET against `urlStr`, pinned to `pinned.address`. Manual redirects (no auto
 * follow), a hard deadline, and a streaming byte cap. The custom `lookup` forces
 * the socket to the pre-validated address; `servername`/Host keep the real
 * hostname so TLS + routing are correct.
 */
function requestPinned(
  urlStr: string,
  pinned: PinnedAddr,
  timeoutMs: number,
  maxBytes: number,
): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    const u = new URL(urlStr);
    const isHttps = u.protocol === "https:";
    const mod = isHttps ? httpsRequest : httpRequest;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const done = (settle: () => void) => {
      clearTimeout(timer);
      settle();
    };

    // Node calls lookup as (hostname, options, cb); with options.all it wants an
    // array, otherwise (err, address, family). Answer both with the pinned addr.
    const pinnedLookup = (
      _hostname: string,
      options: { all?: boolean } | number,
      cb: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void,
    ) => {
      if (typeof options === "object" && options?.all) {
        cb(null, [{ address: pinned.address, family: pinned.family }]);
      } else {
        cb(null, pinned.address, pinned.family);
      }
    };

    const req = mod(
      u,
      {
        method: "GET",
        signal: controller.signal,
        headers: { "User-Agent": USER_AGENT, Accept: "text/html,application/xhtml+xml" },
        // Pin the socket to the validated address; keep SNI = real hostname.
        lookup: pinnedLookup as never,
        ...(isHttps && isIP(u.hostname) === 0 ? { servername: u.hostname } : {}),
      },
      (res) => {
        const status = res.statusCode ?? 0;
        if (status >= 300 && status < 400) {
          res.resume(); // drain so the socket frees
          done(() =>
            resolve({ status, location: res.headers.location ?? null, body: null, tooLarge: false }),
          );
          return;
        }
        if (status < 200 || status >= 300) {
          res.resume();
          done(() => resolve({ status, location: null, body: null, tooLarge: false }));
          return;
        }
        let total = 0;
        const chunks: Buffer[] = [];
        res.on("data", (chunk: Buffer) => {
          total += chunk.length;
          if (total > maxBytes) {
            res.destroy();
            done(() => resolve({ status, location: null, body: null, tooLarge: true }));
            return;
          }
          chunks.push(chunk);
        });
        res.on("end", () =>
          done(() =>
            resolve({
              status,
              location: null,
              body: Buffer.concat(chunks).toString("utf-8"),
              tooLarge: false,
            }),
          ),
        );
        res.on("error", (err) => done(() => reject(err)));
      },
    );
    req.on("error", (err) => done(() => reject(err)));
    req.end();
  });
}

/**
 * Fetch + extract a job posting. `rawUrl` is validated (shape, scheme, SSRF)
 * before any network call, resolved-and-pinned per hop, and re-validated on every
 * redirect.
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

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    // Re-validate on every hop — a validated host must not 3xx us internal.
    if (!isPublicHttpUrl(current)) return { ok: false, error: "blocked_url" };
    const pinned = await resolvePinned(new URL(current).hostname);
    if (!pinned) return { ok: false, error: "blocked_url" };

    let res: RawResponse;
    try {
      res = await requestPinned(current, pinned, TIMEOUT_MS, MAX_BYTES);
    } catch {
      return { ok: false, error: "fetch_failed" };
    }

    if (res.tooLarge) return { ok: false, error: "too_large" };

    if (res.status >= 300 && res.status < 400) {
      if (!res.location) return { ok: false, error: "fetch_failed" };
      try {
        current = new URL(res.location, current).toString();
      } catch {
        return { ok: false, error: "fetch_failed" };
      }
      continue;
    }

    if (res.status < 200 || res.status >= 300 || res.body === null) {
      return { ok: false, error: "fetch_failed" };
    }

    const extracted = extractJobPosting(res.body);
    if (!extracted) return { ok: false, error: "extraction_failed" };
    return { ok: true, posting: { url: rawUrl, ...extracted } };
  }

  return { ok: false, error: "fetch_failed" }; // redirects exhausted
}
