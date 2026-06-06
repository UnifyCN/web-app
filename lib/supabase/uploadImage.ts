import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";

/**
 * Image upload to Supabase Storage. Mirrors the data-service conventions
 * (`isSupabaseConfigured()` + `getAuthUserId()` guards, no-op in the
 * env-not-configured local build). Files land in a public bucket under the
 * user's own folder ("<uid>/<uuid>.<ext>"), which the storage RLS policy
 * requires, and we return the public URL so it can be stored directly on the
 * row and rendered with next/image.
 *
 * Reusable beyond posts (P5 will reuse `uploadImage` for avatars).
 */

export const POST_IMAGES_BUCKET = "post-images";
export const AVATARS_BUCKET = "avatars";

export const MAX_IMAGE_BYTES = 5 * 1024 * 1024; // 5MB
export const ALLOWED_IMAGE_MIME_TYPES: readonly string[] = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
];

/** Reject oversized or non-image files before they hit storage. Throws a
 *  user-readable Error so callers can surface the message directly. */
export function validateImageFile(file: File): void {
  if (!ALLOWED_IMAGE_MIME_TYPES.includes(file.type)) {
    throw new Error("Unsupported file type. Use PNG, JPEG, WebP, or GIF.");
  }
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error("Image is too large. Maximum size is 5MB.");
  }
}

function extensionFor(file: File): string {
  const fromName = file.name.includes(".")
    ? file.name.split(".").pop()
    : undefined;
  if (fromName && fromName.length <= 5) return fromName.toLowerCase();
  const fromType = file.type.split("/").pop();
  return (fromType || "jpg").toLowerCase();
}

/**
 * Upload one file into `bucket` under the given user's folder; returns the
 * public URL. Throws on upload error.
 */
export async function uploadImage(
  file: File,
  bucket: string,
  userId: string,
): Promise<string> {
  validateImageFile(file);

  const supabase = createClient();
  const path = `${userId}/${crypto.randomUUID()}.${extensionFor(file)}`;

  const { error } = await supabase.storage.from(bucket).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
    contentType: file.type || undefined,
  });
  if (error) throw error;

  return supabase.storage.from(bucket).getPublicUrl(path).data.publicUrl;
}

/**
 * Upload the composer's selected post images, preserving input order. Returns
 * an empty array (no-op) in the mock / env-not-configured build so the composer
 * flow stays exercisable locally.
 */
export async function uploadPostImages(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  if (!isSupabaseConfigured()) return [];

  const userId = await getAuthUserId();
  if (!userId) throw new Error("uploadPostImages: no auth session");

  return Promise.all(
    files.map((file) => uploadImage(file, POST_IMAGES_BUCKET, userId)),
  );
}
