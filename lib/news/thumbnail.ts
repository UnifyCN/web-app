/**
 * News thumbnails are small (56–96px), but stored image links ask for an
 * 800px-wide photo. Unsplash resizes on request through its `w` parameter, so
 * for those links we ask for a size that fits the box (doubled for 2x screens).
 * Links on any other host come back unchanged: they belong to arbitrary
 * publishers and offer no resize parameter we can rely on.
 */
export function newsThumbnailSrc(url: string, cssWidth: number): string {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return url;
  }
  if (parsed.hostname !== "images.unsplash.com") return url;
  if (!parsed.searchParams.has("w")) return url;
  parsed.searchParams.set("w", String(Math.ceil(cssWidth * 2)));
  return parsed.toString();
}
