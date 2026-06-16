/**
 * Image upload validation — shared by the client upload helpers
 * (`lib/supabase/imageStorage.ts`) and the server-side `app/api/storage` route.
 * Deliberately dependency-free (no Supabase / browser imports) so the server
 * route can import it without pulling in browser-centric code.
 */

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Reject oversized / non-image files before they hit storage. Throws a
 *  user-readable Error so callers can surface the message directly.
 *
 *  Note: this checks the *declared* MIME type (`file.type`), not the actual
 *  bytes — see BACKLOG "Storage upload MIME type enforcement" for magic-byte
 *  verification. */
export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new Error("Unsupported file type. Use PNG, JPEG, WebP, or GIF.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large. Maximum size is 5MB.");
  }
}
