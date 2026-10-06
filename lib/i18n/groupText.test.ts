import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { SUPPORTED_LANGUAGES } from "./config";
import { pickLocalized, toLocalizedText } from "./localizedText";

const name = { ar: "نادي الموسيقى", es: "Club de música", hi: "  " };

describe("pickLocalized", () => {
  it("shows the English column in English", () => {
    expect(pickLocalized("Music Club", name, "en")).toBe("Music Club");
  });

  it("shows the translation for the active language", () => {
    expect(pickLocalized("Music Club", name, "ar")).toBe("نادي الموسيقى");
    expect(pickLocalized("Music Club", name, "es")).toBe("Club de música");
  });

  it("falls back to English when the language is missing or blank", () => {
    expect(pickLocalized("Music Club", name, "vi")).toBe("Music Club");
    expect(pickLocalized("Music Club", name, "hi")).toBe("Music Club");
  });

  it("falls back to English for a group with no translations", () => {
    expect(pickLocalized("Hiking Club", null, "ar")).toBe("Hiking Club");
    expect(pickLocalized("Hiking Club", undefined, "ar")).toBe("Hiking Club");
    expect(pickLocalized("", null, "ar")).toBe("");
  });

  it("falls back to English when the language is unknown", () => {
    expect(pickLocalized("Music Club", name, undefined)).toBe("Music Club");
  });
});

describe("toLocalizedText", () => {
  it("keeps a map of non-empty strings", () => {
    expect(toLocalizedText({ ar: "نادي", vi: "" })).toEqual({ ar: "نادي" });
  });

  it("drops values that are not text", () => {
    expect(toLocalizedText({ ar: 3, es: null, vi: "Câu lạc bộ" })).toEqual({
      vi: "Câu lạc bộ",
    });
  });

  it.each([null, undefined, "Music Club", 7, ["ar"], {}, { ar: " " }])(
    "returns null for %j",
    (raw) => {
      expect(toLocalizedText(raw)).toBeNull();
    },
  );
});

/* The translations themselves live in the database. The migration that adds
 * the columns also fills them in for the official groups, so check that file:
 * it is the only copy of the text in the repo. */
describe("official group backfill", () => {
  const sql = readFileSync(
    join(
      process.cwd(),
      "supabase/migrations/20261006120000_groups_i18n_columns.sql",
    ),
    "utf8",
  );
  const LANGUAGES = Object.keys(SUPPORTED_LANGUAGES).filter(
    (lang) => lang !== "en",
  );
  const unquote = (literal: string) =>
    JSON.parse(literal.replace(/''/g, "'")) as Record<string, string>;
  const rows = [
    ...sql.matchAll(
      /update public\.groups set\n {2}name_i18n = '(.+)'::jsonb,\n {2}description_i18n = '(.+)'::jsonb\nwhere id = (\d+) and btrim\(group_name, E' \\n\\r\\t'\) = '(.+)';/g,
    ),
  ].map((match) => ({
    id: Number(match[3]),
    english: match[4],
    name: unquote(match[1]),
    description: unquote(match[2]),
  }));

  it("covers the 14 official groups", () => {
    expect(rows).toHaveLength(14);
    expect(new Set(rows.map((row) => row.id)).size).toBe(14);
  });

  it("has every language, and only those, for each name and description", () => {
    for (const row of rows) {
      for (const text of [row.name, row.description]) {
        expect(Object.keys(text).sort(), `group ${row.id}`).toEqual(
          [...LANGUAGES].sort(),
        );
        for (const lang of LANGUAGES) {
          expect(
            toLocalizedText(text)?.[lang],
            `group ${row.id} ${lang}`,
          ).toBeTruthy();
        }
      }
    }
  });

  // Official program names stay in English so people can search for them.
  it("keeps official program names in English", () => {
    const applicants = rows.find((row) => row.english === "PR Applicants");
    expect(applicants).toBeDefined();
    for (const lang of LANGUAGES) {
      for (const term of ["Express Entry", "PNP", "PR"]) {
        expect(applicants?.description[lang], `${lang}: ${term}`).toContain(
          term,
        );
      }
      expect(applicants?.name[lang], lang).toContain("PR");
    }
  });
});
