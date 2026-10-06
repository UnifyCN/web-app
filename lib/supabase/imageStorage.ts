import { validateImageFile } from "@/lib/supabase/imageValidation";

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
 *
 * This module covers writes (upload, delete). Rendering does not sign URLs in
 * the browser any more: images are shown through `/api/storage/image`, which
 * signs, resizes and caches on the server — see `lib/supabase/imageUrl.ts`.
 */

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

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
