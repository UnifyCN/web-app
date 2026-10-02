import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/supabase/client", () => ({ isSupabaseConfigured: () => true }));

import { resolveImageUrl } from "./imageStorage";

function signedUrl(key: string): string {
  // Far-future X-Amz-Date so the cache treats it as fresh.
  return `https://s3.example/${key}?X-Amz-Date=20990101T000000Z&X-Amz-Expires=60`;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveImageUrl batching", () => {
  it("signs keys requested together in one getMany call", async () => {
    const fetchMock = vi.fn(async (_url: string, init: RequestInit) => {
      const { op, keys } = JSON.parse(String(init.body)) as {
        op: string;
        keys: string[];
      };
      expect(op).toBe("getMany");
      const urls = Object.fromEntries(
        keys.map((k) => [k, k.endsWith("bad.jpg") ? null : signedUrl(k)]),
      );
      return new Response(JSON.stringify({ urls }), { status: 200 });
    });
    vi.stubGlobal("fetch", fetchMock);

    const results = await Promise.all([
      resolveImageUrl("users/a/1.jpg"),
      resolveImageUrl("users/b/2.jpg"),
      resolveImageUrl("users/a/1.jpg"), // in-flight dedup
      resolveImageUrl("users/c/bad.jpg"),
      resolveImageUrl("https://images.example/x.jpg"), // pass-through
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const sent = JSON.parse(String(fetchMock.mock.calls[0][1].body)).keys;
    expect(sent).toEqual(["users/a/1.jpg", "users/b/2.jpg", "users/c/bad.jpg"]);
    expect(results).toEqual([
      signedUrl("users/a/1.jpg"),
      signedUrl("users/b/2.jpg"),
      signedUrl("users/a/1.jpg"),
      null,
      "https://images.example/x.jpg",
    ]);

    // Cached: a second resolve makes no request.
    await expect(resolveImageUrl("users/b/2.jpg")).resolves.toBe(
      signedUrl("users/b/2.jpg"),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("resolves every key in the batch to null when the route fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("{}", { status: 502 })),
    );
    await expect(
      Promise.all([
        resolveImageUrl("users/d/1.jpg"),
        resolveImageUrl("users/e/2.jpg"),
      ]),
    ).resolves.toEqual([null, null]);
  });
});
