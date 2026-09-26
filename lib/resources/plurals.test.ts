import { describe, expect, it } from "vitest";
import { makeT } from "./__fixtures__/i18n";

// Web runs i18next with compatibilityJSON "v3": Arabic resolves `_0`…`_5`
// plural forms, never `_plural`, so counts must read naturally in Arabic.
describe("Resources plurals", () => {
  const ar = makeT("ar");
  const en = makeT("en");

  it("picks the Arabic plural category for each count", () => {
    expect(ar("resources.orgCount", { count: 1 })).toBe("منظمة واحدة");
    expect(ar("resources.orgCount", { count: 2 })).toBe("منظمتان");
    expect(ar("resources.orgCount", { count: 3 })).toBe("3 منظمات");
    expect(ar("resources.orgCount", { count: 11 })).toBe("11 منظمة");
    expect(ar("resources.detail.languageCount", { count: 5 })).toBe("5 لغات");
    expect(ar("resources.resultCount", { count: 0 })).toBe("لا توجد نتائج");
  });

  it("keeps English singular/plural", () => {
    expect(en("resources.orgCount", { count: 1 })).toBe("1 organization");
    expect(en("resources.orgCount", { count: 2 })).toBe("2 organizations");
  });
});
