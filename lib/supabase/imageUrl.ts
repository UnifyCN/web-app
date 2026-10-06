/**
 * Stable, cacheable URLs for images stored as signed-URL keys.
 *
 * Stored images are bare S3 object keys (`users/<uid>/<uuid>.jpg`). The signed
 * URLs the storage edge function hands out expire after 60 seconds and point at
 * the full-size original, so using them directly meant every image was
 * re-downloaded at full resolution about once a minute, and a 40px avatar could
 * be a 3000px photo. `/api/storage/image` fixes both: the URL below never
 * changes for a given key and width, the route answers with a long-lived
 * `Cache-Control` (browser and CDN), and the image is resized on the server.
 */

/** Widths the image route will produce. Requests are snapped up to one of these. */
export const IMAGE_WIDTHS = [64, 96, 160, 320, 640, 1080, 1600] as const;
export type ImageWidth = (typeof IMAGE_WIDTHS)[number];

const isHttpUrl = (value: string): boolean => /^https?:\/\//i.test(value);

// The only keys this app stores: `users/<user uuid>/<file>.<jpg|png|webp>`,
// exactly as the upload edge function names them. The image route accepts
// that shape and nothing else: one user folder, one file name, an image
// extension.
const KEY_PATTERN =
  /^users\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\/[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\.(?:jpe?g|png|webp)$/i;

export function isStorageKey(value: string): boolean {
  return KEY_PATTERN.test(value) && !value.includes("..");
}

/** The smallest produced width that covers `cssWidth` on a 2x screen. */
export function pickImageWidth(cssWidth: number): ImageWidth {
  const needed = Math.ceil(cssWidth * 2);
  return (
    IMAGE_WIDTHS.find((width) => width >= needed) ??
    IMAGE_WIDTHS[IMAGE_WIDTHS.length - 1]
  );
}

const routeUrl = (key: string, width: ImageWidth): string =>
  `/api/storage/image?key=${encodeURIComponent(key)}&w=${width}`;

/**
 * URL for a stored image at exactly `width` pixels. Full http(s) URLs (mock
 * data, external or legacy images) pass through unchanged. Returns null for
 * empty or malformed input so callers render their fallback.
 */
export function storageImageUrlAt(
  ref: string | null | undefined,
  width: ImageWidth,
): string | null {
  const key = ref?.trim();
  if (!key) return null;
  if (isHttpUrl(key)) return key;
  if (!isStorageKey(key)) return null;
  return routeUrl(key, width);
}

/** URL for a stored image shown about `cssWidth` CSS pixels wide. */
export function storageImageUrl(
  ref: string | null | undefined,
  cssWidth: number,
): string | null {
  return storageImageUrlAt(ref, pickImageWidth(cssWidth));
}

/** `srcset` across the given produced widths; undefined for pass-through URLs. */
export function storageImageSrcSet(
  ref: string | null | undefined,
  widths: readonly ImageWidth[],
): string | undefined {
  const key = ref?.trim();
  if (!key || isHttpUrl(key) || !isStorageKey(key)) return undefined;
  return widths.map((width) => `${routeUrl(key, width)} ${width}w`).join(", ");
}

/** Validated `key` + `w` from an image request, or null when either is bad. */
export function parseImageRequest(
  params: URLSearchParams,
): { key: string; width: ImageWidth } | null {
  const key = params.get("key")?.trim() ?? "";
  const width = Number(params.get("w"));
  if (!isStorageKey(key)) return null;
  if (!(IMAGE_WIDTHS as readonly number[]).includes(width)) return null;
  return { key, width: width as ImageWidth };
}
