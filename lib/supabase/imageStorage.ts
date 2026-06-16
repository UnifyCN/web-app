import { isSupabaseConfigured } from "@/lib/supabase/client";

/**
 * Signed-URL image storage — a 1:1 port of the mobile app's approach
 * (`services/s3/avatarUrlCache.ts` + `uploadProfilePicture.ts`). Images are
 * stored in the DB as bare object keys (`users/<uid>/<uuid>.jpg`) and resolved
 * to short-lived signed S3 URLs at render time via three edge functions that
 * are deployed on the shared (mobile) project:
 *
 *   profile-picture-upload  { contentType }       -> { uploadUrl, key }
 *   profile-picture-get     { key }               -> { url }   (X-Amz-Expires)
 *   profile-picture-remove  { key }               -> { deleteUrl }
 *
 * The same functions serve avatars and post images (one S3 namespace). Those
 * functions were built for the native app and emit no CORS headers, so the
 * browser can't call them directly — every call below goes through the
 * same-origin `app/api/storage` route, which invokes them server-side.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Reject oversized / non-image files before they hit storage. Throws a
 *  user-readable Error so callers can surface the message directly. */
export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new Error("Unsupported file type. Use PNG, JPEG, WebP, or GIF.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large. Maximum size is 5MB.");
  }
}

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

const DEFAULT_TTL_MS = 4 * 60 * 1000; // fallback when the signature has no expiry
const REFRESH_BUFFER_MS = 30 * 1000; // re-sign 30s before the URL actually expires

interface CacheEntry {
  url: string;
  expiresAt: number;
}
const urlCache = new Map<string, CacheEntry>();
const inflight = new Map<string, Promise<string | null>>();

const MAX_CACHE_ENTRIES = 500; // LRU cap so long-lived sessions don't grow unbounded

/**
 * Insert/refresh a cache entry with LRU eviction. `Map` iterates in insertion
 * order, so deleting-then-setting moves a key to the newest position; when the
 * cache is full we drop the oldest (least-recently-used) key first.
 */
function cacheSet(key: string, entry: CacheEntry): void {
  urlCache.delete(key);
  if (urlCache.size >= MAX_CACHE_ENTRIES) {
    const oldest = urlCache.keys().next().value;
    if (oldest !== undefined) urlCache.delete(oldest);
  }
  urlCache.set(key, entry);
}

/** Expiry (epoch ms) embedded in an S3 SigV4 signed URL, or null if unparseable. */
function parseSignedUrlExpiry(url: string): number | null {
  try {
    const parsed = new URL(url);
    const amzDate = parsed.searchParams.get("X-Amz-Date"); // YYYYMMDDTHHMMSSZ
    const amzExpires = parsed.searchParams.get("X-Amz-Expires"); // seconds
    if (!amzDate || !amzExpires) return null;
    const base = Date.UTC(
      Number(amzDate.slice(0, 4)),
      Number(amzDate.slice(4, 6)) - 1,
      Number(amzDate.slice(6, 8)),
      Number(amzDate.slice(9, 11)),
      Number(amzDate.slice(11, 13)),
      Number(amzDate.slice(13, 15)),
    );
    const seconds = Number(amzExpires);
    if (!Number.isFinite(base) || Number.isNaN(base)) return null;
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return base + seconds * 1000;
  } catch {
    return null;
  }
}

/**
 * Resolve a stored image reference to a renderable URL. Full http(s) URLs
 * (mock / external / legacy) pass through unchanged; bare keys are signed via
 * the same-origin `/api/storage` proxy, cached until ~30s before expiry, with
 * in-flight dedup so a feed full of the same author avatar makes one request.
 * Returns null for empty input or on failure — React Query disallows
 * `undefined` query data — so the caller falls back gracefully.
 */
export async function resolveImageUrl(
  ref?: string | null,
): Promise<string | null> {
  const key = ref?.trim();
  if (!key) return null;
  if (isHttpUrl(key)) return key;
  if (!isSupabaseConfigured()) return null;

  const cached = urlCache.get(key);
  if (cached && cached.expiresAt - Date.now() > REFRESH_BUFFER_MS) {
    cacheSet(key, cached); // LRU touch — mark as recently used
    return cached.url;
  }

  const existing = inflight.get(key);
  if (existing) return existing;

  const request = fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "get", key }),
  })
    .then(async (res) => {
      if (!res.ok) throw new Error(`sign failed (${res.status})`);
      const { url } = (await res.json()) as { url?: string };
      if (!url) throw new Error("no signed url returned");
      cacheSet(key, {
        url,
        expiresAt: parseSignedUrlExpiry(url) ?? Date.now() + DEFAULT_TTL_MS,
      });
      return url;
    })
    .catch((error) => {
      console.error("resolveImageUrl failed", key, error);
      return null;
    })
    .finally(() => {
      inflight.delete(key);
    });

  inflight.set(key, request);
  return request;
}

/**
 * Upload a file through the same-origin `/api/storage` proxy, which signs the
 * upload via `profile-picture-upload` (the edge function owns the
 * `users/<uid>/<uuid>.<ext>` key) and PUTs it to S3 server-side (avoiding the
 * browser→S3 CORS). Returns the bare key to store on the row. Throws on
 * validation / sign / upload error.
 */
export async function uploadImageToStorage(file: File): Promise<string> {
  validateImageFile(file);

  const form = new FormData();
  form.append("file", file);
  const res = await fetch("/api/storage", { method: "POST", body: form });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? `Storage upload failed (${res.status})`);
  }
  const { key } = (await res.json()) as { key?: string };
  if (!key) throw new Error("Upload returned no key");
  return key;
}

/** Delete a stored object by its key through the `/api/storage` proxy
 *  (`profile-picture-remove` + a server-side S3 DELETE). No-op for empty input
 *  or legacy full URLs (nothing to remove). */
export async function deleteImageFromStorage(
  key: string | null | undefined,
): Promise<void> {
  if (!key || isHttpUrl(key)) return;

  const res = await fetch("/api/storage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ op: "remove", key }),
  });
  if (!res.ok) {
    const { error } = (await res.json().catch(() => ({}))) as {
      error?: string;
    };
    throw new Error(error ?? `Storage delete failed (${res.status})`);
  }
}
