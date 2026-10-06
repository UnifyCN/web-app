import { describe, expect, it } from "vitest";
import { newsThumbnailSrc } from "./thumbnail";

describe("newsThumbnailSrc", () => {
  it("asks Unsplash for a box-sized image", () => {
    expect(
      newsThumbnailSrc(
        "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=800&q=80&auto=format&fit=crop",
        56,
      ),
    ).toBe(
      "https://images.unsplash.com/photo-1554224155-6726b3ff858f?w=112&q=80&auto=format&fit=crop",
    );
  });

  it("leaves other hosts and unsized links alone", () => {
    const publisher = "https://www.cicnews.com/wp-content/uploads/a.jpg?w=800";
    expect(newsThumbnailSrc(publisher, 56)).toBe(publisher);
    const unsized = "https://images.unsplash.com/photo-1554224155-6726b3ff858f";
    expect(newsThumbnailSrc(unsized, 56)).toBe(unsized);
    expect(newsThumbnailSrc("not a url", 56)).toBe("not a url");
  });
});
