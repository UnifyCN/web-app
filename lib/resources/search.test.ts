import { describe, expect, it } from "vitest";
import { makeT } from "./__fixtures__/i18n";
import { getActiveResourcePartners } from "./partners";
import { normalizeQuery, selectPartnersMatching } from "./search";

const label = () => "";
const enT = makeT("en");
const all = getActiveResourcePartners(enT, enT);
const slugs = (q: string) =>
  selectPartnersMatching(all, q, label).map((p) => p.slug);

describe("normalizeQuery", () => {
  it("folds Latin accents and case", () => {
    expect(normalizeQuery("  Québec ")).toBe("quebec");
  });

  it("folds Vietnamese đ", () => {
    expect(normalizeQuery("Định")).toBe("dinh");
  });

  it("folds Arabic marks and letter variants", () => {
    expect(normalizeQuery("مُؤَسَّسَة")).toBe(normalizeQuery("موسسه"));
  });
});

describe("selectPartnersMatching", () => {
  it("returns everything for a blank query", () => {
    expect(slugs("   ")).toHaveLength(all.length);
  });

  it("requires every token to match", () => {
    expect(slugs("surrey library")).toEqual(["surrey-libraries"]);
  });

  it("searches Arabic copy with Arabic folding", () => {
    const arT = makeT("ar");
    const arabic = getActiveResourcePartners(arT, enT);
    const hits = selectPartnersMatching(arabic, "مكتبة", label).map((p) => p.slug);
    expect(hits.length).toBeGreaterThan(0);
  });

  it("searches program names", () => {
    expect(slugs("mentorconnect")).toEqual(["iec-bc"]);
  });
});
