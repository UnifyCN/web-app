/**
 * `Cache-Control` values for stored images (see app/api/storage/image/route.ts).
 * A key never changes what it points at and the bytes do not depend on who
 * asked, so both keep the result for a year in the browser.
 */

/** Browser only. Also what a response that sets a cookie must use. */
export const PRIVATE_IMAGE_CACHE_CONTROL =
  "private, max-age=31536000, immutable";

/** Browser, plus 30 days at the CDN so one request does the work for everyone. */
export const SHARED_IMAGE_CACHE_CONTROL =
  "public, max-age=31536000, s-maxage=2592000, immutable";
