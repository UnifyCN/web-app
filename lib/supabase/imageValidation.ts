/**
 * Image upload validation — shared by the client upload helpers
 * (`lib/supabase/imageStorage.ts`) and the server-side `app/api/storage` route.
 * Deliberately dependency-free (no Supabase / browser imports) so the server
 * route can import it without pulling in browser-centric code.
 */

// 4MB — kept under Vercel's ~4.5MB serverless request-body cap so the limit the
// UI promises matches what the platform actually accepts (a 4.5–5MB image used
// to be rejected by Vercel with a generic error before reaching our handler).
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024; // 4MB
export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Error thrown by validateImageFile. `reason` lets the server route map the
 *  cause to the right HTTP status (size → 413 Payload Too Large, type → 400).
 *  Extends Error, so browser callers that only read `.message` are unaffected. */
export class ImageValidationError extends Error {
  constructor(
    message: string,
    readonly reason: "type" | "size",
  ) {
    super(message);
    this.name = "ImageValidationError";
  }
}

/** Reject oversized / non-image files before they hit storage. Throws an
 *  ImageValidationError whose `.message` callers can surface directly.
 *
 *  Note: this checks the *declared* MIME type (`file.type`), not the actual
 *  bytes. Shared with the browser, so it stays dependency-free; the server route
 *  (`app/api/storage/route.ts`) additionally sniffs the leading bytes
 *  (magic-byte verification) to catch a spoofed Content-Type. */
export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new ImageValidationError(
      "Unsupported file type. Use PNG, JPEG, WebP, or GIF.",
      "type",
    );
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new ImageValidationError(
      "Image is too large. Maximum size is 4MB.",
      "size",
    );
  }
}
