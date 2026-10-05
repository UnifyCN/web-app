/**
 * Store listings for the Unify mobile app. The App Store link mirrors the
 * mobile repo's `constants/appStore.ts` and the landing page's download buttons.
 */
export const APP_STORE_ID = "6754875762";

export const APP_STORE_URL = `https://apps.apple.com/ca/app/unify-newcomer-support/id${APP_STORE_ID}`;

/**
 * There is no Google Play listing yet. Set this when one ships: Android
 * devices then get the link back (give the "for iPhone" description in
 * `settingsWeb.getMobileAppDesc` an Android variant at the same time).
 */
export const PLAY_STORE_URL: string | null = null;

/**
 * The store link to offer a device, or null when its platform has no listing.
 * Android gets the Play link only, never the App Store page it can't use.
 */
export function mobileAppUrl(userAgent: string): string | null {
  return /android/i.test(userAgent) ? PLAY_STORE_URL : APP_STORE_URL;
}
