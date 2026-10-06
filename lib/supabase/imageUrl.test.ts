import { describe, expect, it } from "vitest";
import {
  isStorageKey,
  parseImageRequest,
  pickImageWidth,
  storageImageSrcSet,
  storageImageUrl,
} from "./imageUrl";

const KEY = "users/1ddb1707-8cfc-4a63-9534-000000000000/3f2a.jpg";

describe("storageImageUrl", () => {
  it("builds a stable same-origin URL for a stored key", () => {
    expect(storageImageUrl(KEY, 40)).toBe(
      `/api/storage/image?key=${encodeURIComponent(KEY)}&w=96`,
    );
    // Same input, same URL: this is what lets the browser cache it.
    expect(storageImageUrl(KEY, 40)).toBe(storageImageUrl(` ${KEY} `, 40));
  });

  it("passes full URLs through untouched", () => {
    const url = "https://images.unsplash.com/photo-1?w=800";
    expect(storageImageUrl(url, 40)).toBe(url);
    expect(storageImageSrcSet(url, [320, 640])).toBeUndefined();
  });

  it("returns null for empty or malformed references", () => {
    expect(storageImageUrl(null, 40)).toBeNull();
    expect(storageImageUrl("  ", 40)).toBeNull();
    expect(storageImageUrl("users/../secrets", 40)).toBeNull();
    expect(storageImageUrl("users/a b.jpg", 40)).toBeNull();
  });

  it("lists one candidate per width in a srcset", () => {
    expect(storageImageSrcSet(KEY, [320, 640])).toBe(
      `/api/storage/image?key=${encodeURIComponent(KEY)}&w=320 320w, ` +
        `/api/storage/image?key=${encodeURIComponent(KEY)}&w=640 640w`,
    );
  });
});

describe("pickImageWidth", () => {
  it("covers a 2x screen with the smallest produced width", () => {
    expect(pickImageWidth(24)).toBe(64);
    expect(pickImageWidth(40)).toBe(96);
    expect(pickImageWidth(80)).toBe(160);
    expect(pickImageWidth(640)).toBe(1600);
  });

  it("caps at the largest produced width", () => {
    expect(pickImageWidth(5000)).toBe(1600);
  });
});

describe("parseImageRequest", () => {
  const params = (query: string) => new URLSearchParams(query);

  it("accepts a stored key with a produced width", () => {
    expect(
      parseImageRequest(params(`key=${encodeURIComponent(KEY)}&w=96`)),
    ).toEqual({ key: KEY, width: 96 });
  });

  it("rejects widths the route does not produce", () => {
    expect(parseImageRequest(params(`key=${KEY}&w=97`))).toBeNull();
    expect(parseImageRequest(params(`key=${KEY}`))).toBeNull();
    expect(parseImageRequest(params(`key=${KEY}&w=abc`))).toBeNull();
  });

  it("rejects anything that is not a plain object key", () => {
    for (const key of [
      "",
      "https://example.com/a.jpg",
      "users/../../etc/passwd",
      "users//a.jpg",
      "/users/a.jpg",
      "users/a.jpg?x=1",
    ]) {
      expect(isStorageKey(key), key).toBe(false);
      expect(
        parseImageRequest(params(`key=${encodeURIComponent(key)}&w=96`)),
      ).toBeNull();
    }
  });
});
