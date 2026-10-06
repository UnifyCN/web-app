import { describe, expect, it } from "vitest";
import { STORAGE_HOST, isTrustedStorageUrl } from "./storageHost";

const KEY = "users/1ddb1707-8cfc-4a63-9534-000000000000/1790058218989.jpg";
const signed = (origin: string, path = `/${KEY}`) =>
  `${origin}${path}?X-Amz-Algorithm=AWS4-HMAC-SHA256&X-Amz-Expires=60`;

describe("isTrustedStorageUrl", () => {
  it("accepts a signed URL for the requested key on the storage host", () => {
    expect(isTrustedStorageUrl(signed(`https://${STORAGE_HOST}`), KEY)).toBe(
      true,
    );
  });

  it("refuses any other host", () => {
    for (const origin of [
      "https://example.com",
      "https://s3.us-west-2.amazonaws.com",
      "https://other-bucket.s3.us-west-2.amazonaws.com",
      `https://${STORAGE_HOST}.example.com`,
      `https://evil.${STORAGE_HOST}`,
      "https://169.254.169.254",
      "https://localhost",
      "https://10.0.0.1",
      `https://${STORAGE_HOST}@example.com`,
    ]) {
      expect(isTrustedStorageUrl(signed(origin), KEY), origin).toBe(false);
    }
  });

  it("refuses plain http, other ports and embedded credentials", () => {
    expect(isTrustedStorageUrl(signed(`http://${STORAGE_HOST}`), KEY)).toBe(
      false,
    );
    expect(isTrustedStorageUrl(signed(`https://${STORAGE_HOST}:8443`), KEY)).toBe(
      false,
    );
    expect(
      isTrustedStorageUrl(signed(`https://user:pass@${STORAGE_HOST}`), KEY),
    ).toBe(false);
  });

  it("refuses a URL for a different object than the one requested", () => {
    expect(
      isTrustedStorageUrl(
        signed(`https://${STORAGE_HOST}`, "/knowledge/guide.pdf"),
        KEY,
      ),
    ).toBe(false);
    expect(
      isTrustedStorageUrl(signed(`https://${STORAGE_HOST}`, `/${KEY}/..`), KEY),
    ).toBe(false);
  });

  it("refuses values that are not URLs", () => {
    for (const value of ["", "not a url", "//example.com/a.jpg", "file:///etc/passwd"]) {
      expect(isTrustedStorageUrl(value, KEY), value).toBe(false);
    }
  });
});
