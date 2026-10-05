import { describe, expect, it } from "vitest";
import { APP_STORE_URL, PLAY_STORE_URL, mobileAppUrl } from "./appLinks";

const IPHONE =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1";
const ANDROID =
  "Mozilla/5.0 (Linux; Android 14; SM-A155M) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const DESKTOP =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";

describe("mobileAppUrl", () => {
  it("offers the App Store listing on iPhone and desktop", () => {
    expect(mobileAppUrl(IPHONE)).toBe(APP_STORE_URL);
    expect(mobileAppUrl(DESKTOP)).toBe(APP_STORE_URL);
  });

  it("never sends an Android device to the App Store", () => {
    expect(mobileAppUrl(ANDROID)).toBe(PLAY_STORE_URL);
    expect(mobileAppUrl(ANDROID)).not.toBe(APP_STORE_URL);
  });
});
