import { describe, expect, it } from "vitest";
import {
  COVER_ACCEPT,
  COVER_EMPTY_MESSAGE,
  COVER_MAX_BYTES,
  COVER_SIZE_MESSAGE,
  COVER_TYPE_MESSAGE,
  EVENT_COVERS_BUCKET,
  KEEP_COVER,
  buildCoverObjectPath,
  coverColumn,
  coverObjectPathFromUrl,
  coverPublicUrlPrefix,
  formatFileSize,
  isEventCoverUrl,
  staleCoverPath,
  validateCoverFile,
} from "./eventCover";

const SUPABASE_URL = "https://wrbauxutkysljmsqojts.supabase.co";
const PREFIX = `${SUPABASE_URL}/storage/v1/object/public/event-covers/`;
const UUID = "3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d";
const OUR_COVER = `${PREFIX}${UUID}.jpg`;

describe("validateCoverFile", () => {
  it("accepts JPEG, PNG and WebP up to 5 MB, with the extension to store", () => {
    expect(validateCoverFile({ type: "image/jpeg", size: 1 })).toEqual({
      ok: true,
      extension: "jpg",
      contentType: "image/jpeg",
    });
    expect(validateCoverFile({ type: "image/png", size: 2048 })).toMatchObject({
      ok: true,
      extension: "png",
    });
    expect(
      validateCoverFile({ type: "image/webp", size: COVER_MAX_BYTES }),
    ).toMatchObject({ ok: true, extension: "webp" });
  });

  it("reads the MIME type case-insensitively", () => {
    expect(validateCoverFile({ type: "IMAGE/JPEG", size: 10 })).toMatchObject({
      ok: true,
      contentType: "image/jpeg",
    });
  });

  it("rejects other types with a clear message", () => {
    for (const type of [
      "image/gif",
      "image/heic",
      "image/svg+xml",
      "application/pdf",
      "",
      "image/jpg",
      "toString",
    ]) {
      expect(validateCoverFile({ type, size: 10 })).toEqual({
        ok: false,
        message: COVER_TYPE_MESSAGE,
      });
    }
  });

  it("rejects a file over 5 MB (the bucket limit, 5242880 bytes)", () => {
    expect(COVER_MAX_BYTES).toBe(5_242_880);
    expect(
      validateCoverFile({ type: "image/png", size: COVER_MAX_BYTES + 1 }),
    ).toEqual({ ok: false, message: COVER_SIZE_MESSAGE });
  });

  it("rejects an empty file", () => {
    expect(validateCoverFile({ type: "image/png", size: 0 })).toEqual({
      ok: false,
      message: COVER_EMPTY_MESSAGE,
    });
  });

  it("matches the file input's accept list", () => {
    expect(COVER_ACCEPT).toBe("image/jpeg,image/png,image/webp");
  });
});

describe("buildCoverObjectPath", () => {
  it("is <uuid>.<ext> at the bucket root", () => {
    expect(buildCoverObjectPath("jpg", UUID)).toBe(`${UUID}.jpg`);
    expect(buildCoverObjectPath("webp", UUID.toUpperCase())).toBe(`${UUID}.webp`);
  });

  it("works with crypto.randomUUID()", () => {
    const path = buildCoverObjectPath("png", crypto.randomUUID());
    expect(path).toMatch(/^[0-9a-f-]{36}\.png$/);
  });

  it("refuses anything that is not a UUID", () => {
    for (const bad of ["", "abc", "../x", `${UUID}/x`]) {
      expect(() => buildCoverObjectPath("jpg", bad)).toThrow();
    }
  });
});

describe("coverPublicUrlPrefix", () => {
  it("is the bucket's public URL prefix for the project", () => {
    expect(coverPublicUrlPrefix(SUPABASE_URL)).toBe(PREFIX);
    expect(coverPublicUrlPrefix(`${SUPABASE_URL}/`)).toBe(PREFIX);
    expect(EVENT_COVERS_BUCKET).toBe("event-covers");
  });

  it("is null without a usable project URL", () => {
    expect(coverPublicUrlPrefix("")).toBeNull();
    expect(coverPublicUrlPrefix("not a url")).toBeNull();
  });
});

describe("coverObjectPathFromUrl / isEventCoverUrl", () => {
  it("returns the object path of one of our covers", () => {
    expect(coverObjectPathFromUrl(OUR_COVER, SUPABASE_URL)).toBe(`${UUID}.jpg`);
    expect(isEventCoverUrl(OUR_COVER, SUPABASE_URL)).toBe(true);
  });

  it("ignores a query string or hash", () => {
    expect(coverObjectPathFromUrl(`${OUR_COVER}?t=1#x`, SUPABASE_URL)).toBe(
      `${UUID}.jpg`,
    );
  });

  it("decodes an encoded object name", () => {
    expect(coverObjectPathFromUrl(`${PREFIX}my%20cover.png`, SUPABASE_URL)).toBe(
      "my cover.png",
    );
  });

  it("never matches a crawler's external image", () => {
    for (const url of [
      "https://mosaicbc.org/wp-content/uploads/2022/07/event.jpg",
      "https://images.pexels.com/photos/1/pexels-photo-1.jpeg",
      "https://issbc.org/storage/v1/object/public/event-covers/x.jpg",
      // Look-alike hosts.
      `https://wrbauxutkysljmsqojts.supabase.co.evil.com/storage/v1/object/public/event-covers/${UUID}.jpg`,
      `https://evil.com/?u=${OUR_COVER}`,
    ]) {
      expect(coverObjectPathFromUrl(url, SUPABASE_URL)).toBeNull();
    }
  });

  it("never matches another project, bucket, or API path", () => {
    for (const url of [
      `https://pbiszrycmcxmzxrnkkwr.supabase.co/storage/v1/object/public/event-covers/${UUID}.jpg`,
      `${SUPABASE_URL}/storage/v1/object/public/avatars/${UUID}.jpg`,
      `${SUPABASE_URL}/storage/v1/object/public/event-covers-old/${UUID}.jpg`,
      `${SUPABASE_URL}/storage/v1/object/sign/event-covers/${UUID}.jpg?token=x`,
      `${SUPABASE_URL}/storage/v1/object/event-covers/${UUID}.jpg`,
      `http://wrbauxutkysljmsqojts.supabase.co/storage/v1/object/public/event-covers/${UUID}.jpg`,
    ]) {
      expect(coverObjectPathFromUrl(url, SUPABASE_URL)).toBeNull();
    }
  });

  it("never returns a path outside the bucket root", () => {
    for (const url of [
      PREFIX, // the bucket itself
      `${PREFIX}nested/${UUID}.jpg`,
      `${PREFIX}..%2Favatars%2Fx.jpg`,
      `${PREFIX}%2e%2e`,
      `${PREFIX}.`,
      `${PREFIX}../avatars/x.jpg`,
      `${PREFIX}a%5Cb.jpg`,
      `${PREFIX}%E0%A4%A`, // malformed escape
    ]) {
      expect(coverObjectPathFromUrl(url, SUPABASE_URL)).toBeNull();
    }
  });

  it("is null for empty, relative, or non-http values", () => {
    for (const url of [null, undefined, "", "   ", `/storage/v1/object/public/event-covers/${UUID}.jpg`, "javascript:alert(1)", "data:image/png;base64,AAAA"]) {
      expect(coverObjectPathFromUrl(url, SUPABASE_URL)).toBeNull();
      expect(isEventCoverUrl(url, SUPABASE_URL)).toBe(false);
    }
  });

  it("is null when the project URL is missing (never guesses)", () => {
    expect(coverObjectPathFromUrl(OUR_COVER, "")).toBeNull();
  });
});

describe("coverColumn", () => {
  it("sends nothing for keep, so the stored value stays", () => {
    expect(coverColumn(KEEP_COVER, null)).toEqual({});
    expect("cover_photo_url" in coverColumn(KEEP_COVER, null)).toBe(false);
  });

  it("sends null for remove", () => {
    expect(coverColumn({ kind: "remove" }, null)).toEqual({ cover_photo_url: null });
  });

  it("sends the uploaded URL for replace", () => {
    expect(coverColumn({ kind: "replace", file: "f" }, OUR_COVER)).toEqual({
      cover_photo_url: OUR_COVER,
    });
  });

  it("refuses a replace without an uploaded URL", () => {
    expect(() => coverColumn({ kind: "replace", file: "f" }, null)).toThrow();
  });
});

describe("staleCoverPath", () => {
  it("removes our old cover when it is replaced or removed", () => {
    expect(
      staleCoverPath(OUR_COVER, { kind: "replace", file: "f" }, SUPABASE_URL),
    ).toBe(`${UUID}.jpg`);
    expect(staleCoverPath(OUR_COVER, { kind: "remove" }, SUPABASE_URL)).toBe(
      `${UUID}.jpg`,
    );
  });

  it("removes nothing when the cover is kept", () => {
    expect(staleCoverPath(OUR_COVER, KEEP_COVER, SUPABASE_URL)).toBeNull();
  });

  it("never removes an external image or a missing cover", () => {
    const external = "https://mosaicbc.org/wp-content/uploads/2022/07/event.jpg";
    expect(staleCoverPath(external, { kind: "remove" }, SUPABASE_URL)).toBeNull();
    expect(
      staleCoverPath(external, { kind: "replace", file: "f" }, SUPABASE_URL),
    ).toBeNull();
    expect(staleCoverPath(null, { kind: "remove" }, SUPABASE_URL)).toBeNull();
  });
});

describe("formatFileSize", () => {
  it("shows MB above 1 MB and KB below", () => {
    expect(formatFileSize(COVER_MAX_BYTES)).toBe("5 MB");
    expect(formatFileSize(2.44 * 1024 * 1024)).toBe("2.4 MB");
    expect(formatFileSize(830 * 1024)).toBe("830 KB");
    expect(formatFileSize(12)).toBe("1 KB");
  });
});
