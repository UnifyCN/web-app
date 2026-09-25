import { describe, expect, it } from "vitest";
import { getActiveResourcePartners } from "./partners";
import { normalizeQuery, selectPartnersMatching } from "./search";

const label = () => "";
const slugs = (q: string) =>
  selectPartnersMatching(getActiveResourcePartners(), q, label).map((p) => p.slug);

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
    expect(slugs("   ")).toHaveLength(getActiveResourcePartners().length);
  });

  it("requires every token to match", () => {
    expect(slugs("surrey library")).toEqual(["surrey-libraries"]);
  });

  it("searches program names", () => {
    expect(slugs("mentorconnect")).toEqual(["iec-bc"]);
  });
});
