/**
 * Pure logic behind the team-event cover photo (spec #142, slice #147): file checks,
 * the object path, and which `event-covers` object an old URL points at. Free of
 * React and Supabase so it is unit-tested (eventCover.test.ts); the Storage calls
 * live in services/adminEvents.ts.
 *
 * The bucket (`event-covers`, public, 5 MB, JPEG/PNG/WebP) and its admin-only
 * storage.objects policies come from 20260926120000_events_admin.sql. The bucket
 * enforces the same size and types, so these checks only give a clear message
 * before any upload starts.
 */

/** The public Storage bucket that holds team-event covers. */
export const EVENT_COVERS_BUCKET = "event-covers";

/** 5 MB: the bucket's `file_size_limit` (5242880). */
export const COVER_MAX_BYTES = 5 * 1024 * 1024;

/** The accepted MIME types (the bucket's `allowed_mime_types`) and their file extension. */
export const COVER_MIME_EXTENSIONS = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
} as const;

export type CoverMimeType = keyof typeof COVER_MIME_EXTENSIONS;
export type CoverExtension = (typeof COVER_MIME_EXTENSIONS)[CoverMimeType];

/** The `accept` attribute of the file input. */
export const COVER_ACCEPT = Object.keys(COVER_MIME_EXTENSIONS).join(",");

export const COVER_TYPE_MESSAGE = "Use a JPEG, PNG, or WebP image.";
export const COVER_SIZE_MESSAGE = "The image is larger than 5 MB. Use a smaller image.";
export const COVER_EMPTY_MESSAGE = "This file is empty. Choose another image.";
export const COVER_UPLOAD_FAILED_MESSAGE =
  "Could not upload the cover photo. Try again, or remove the photo and save.";

export type CoverFileCheck =
  | { ok: true; extension: CoverExtension; contentType: CoverMimeType }
  | { ok: false; message: string };

function isCoverMimeType(type: string): type is CoverMimeType {
  return Object.prototype.hasOwnProperty.call(COVER_MIME_EXTENSIONS, type);
}

/**
 * Checks a picked file (only `type` and `size` are read, so a `File` fits). The type
 * check reads the browser's MIME type, the same value the upload sends as its
 * Content-Type and the bucket checks.
 */
export function validateCoverFile(file: {
  type: string;
  size: number;
}): CoverFileCheck {
  const type = file.type.trim().toLowerCase();
  if (!isCoverMimeType(type)) return { ok: false, message: COVER_TYPE_MESSAGE };
  if (file.size <= 0) return { ok: false, message: COVER_EMPTY_MESSAGE };
  if (file.size > COVER_MAX_BYTES) return { ok: false, message: COVER_SIZE_MESSAGE };
  return { ok: true, extension: COVER_MIME_EXTENSIONS[type], contentType: type };
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The object path inside the bucket: `<uuid>.<ext>` (at the bucket root). */
export function buildCoverObjectPath(
  extension: CoverExtension,
  uuid: string,
): string {
  if (!UUID_RE.test(uuid)) {
    throw new Error(`buildCoverObjectPath: not a UUID: ${uuid}`);
  }
  return `${uuid.toLowerCase()}.${extension}`;
}

/** The path every public object URL of the bucket starts with. */
const PUBLIC_PATH_PREFIX = `/storage/v1/object/public/${EVENT_COVERS_BUCKET}/`;

/**
 * The public URL prefix of the bucket for a Supabase project URL
 * (`https://<ref>.supabase.co` → `https://<ref>.supabase.co/storage/v1/object/public/event-covers/`),
 * or null when the project URL is empty or malformed.
 */
export function coverPublicUrlPrefix(supabaseUrl: string): string | null {
  try {
    const origin = new URL(supabaseUrl.trim()).origin;
    return origin === "null" ? null : `${origin}${PUBLIC_PATH_PREFIX}`;
  } catch {
    return null;
  }
}

/**
 * The `event-covers` object path that a stored cover URL points at, or null when
 * the URL is not one of our covers: another host (e.g. a crawler's external image),
 * another bucket, a nested or odd path, or anything that does not parse. Only a
 * non-null result may ever be removed from Storage.
 *
 * `new URL` resolves `..` and `.` segments first, so a URL that climbs out of the
 * bucket fails the prefix check. The object name must be a single segment (no
 * encoded `/`), so the result can never name an object outside the bucket root.
 */
export function coverObjectPathFromUrl(
  url: string | null | undefined,
  supabaseUrl: string,
): string | null {
  if (!url) return null;
  const prefix = coverPublicUrlPrefix(supabaseUrl);
  if (!prefix) return null;

  let parsed: URL;
  try {
    parsed = new URL(url.trim());
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
  if (parsed.origin !== new URL(prefix).origin) return null;
  if (!parsed.pathname.startsWith(PUBLIC_PATH_PREFIX)) return null;

  const encodedName = parsed.pathname.slice(PUBLIC_PATH_PREFIX.length);
  if (!encodedName || encodedName.includes("/")) return null;

  let name: string;
  try {
    name = decodeURIComponent(encodedName);
  } catch {
    return null;
  }
  if (name === "." || name === ".." || /[/\\]/.test(name)) return null;
  return name;
}

/** True when a stored cover URL is an object in our `event-covers` bucket. */
export function isEventCoverUrl(
  url: string | null | undefined,
  supabaseUrl: string,
): boolean {
  return coverObjectPathFromUrl(url, supabaseUrl) !== null;
}

/* ---- Cover changes on save ---------------------------------------------- */

/**
 * What the form asks for on save:
 * - `keep`: leave `cover_photo_url` as stored (it is not sent);
 * - `replace`: upload `file`, then store its public URL;
 * - `remove`: store null.
 */
export type CoverChange<F = File> =
  | { kind: "keep" }
  | { kind: "replace"; file: F }
  | { kind: "remove" };

export const KEEP_COVER = { kind: "keep" } as const satisfies CoverChange<never>;

/**
 * The `cover_photo_url` part of the row payload: nothing for `keep` (the stored
 * value stays), the uploaded public URL for `replace`, null for `remove`.
 */
export function coverColumn(
  change: CoverChange<unknown>,
  uploadedUrl: string | null,
): { cover_photo_url?: string | null } {
  switch (change.kind) {
    case "keep":
      return {};
    case "remove":
      return { cover_photo_url: null };
    case "replace":
      if (!uploadedUrl) {
        throw new Error("coverColumn: a replaced cover needs its uploaded URL");
      }
      return { cover_photo_url: uploadedUrl };
  }
}

/**
 * The old `event-covers` object to remove once a save has succeeded, or null.
 * Removed only when the stored URL is ours and the saved row no longer points at
 * it; an external (crawler) URL is never touched.
 */
export function staleCoverPath(
  previousUrl: string | null | undefined,
  change: CoverChange<unknown>,
  supabaseUrl: string,
): string | null {
  if (change.kind === "keep") return null;
  return coverObjectPathFromUrl(previousUrl, supabaseUrl);
}

/** "2.4 MB" / "830 KB", for the picked-file caption. */
export function formatFileSize(bytes: number): string {
  if (bytes >= 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}
