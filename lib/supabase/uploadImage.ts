import { getAuthUserId, isSupabaseConfigured } from "@/lib/supabase/client";
import { uploadImageToStorage } from "@/lib/supabase/imageStorage";

/**
 * Upload the composer's selected post images, preserving input order. Each file
 * goes through the shared `profile-picture-upload` edge function (which owns the
 * `users/<uid>/<uuid>.<ext>` key); we store the returned **bare key** and resolve
 * it to a signed URL at render time, matching the mobile app. Returns an empty
 * array (no-op) in the mock / env-not-configured build so the composer flow stays
 * exercisable locally.
 */
export async function uploadPostImages(files: File[]): Promise<string[]> {
  if (files.length === 0) return [];
  if (!isSupabaseConfigured()) return [];

  const userId = await getAuthUserId();
  if (!userId) throw new Error("uploadPostImages: no auth session");

  return Promise.all(files.map((file) => uploadImageToStorage(file)));
}
