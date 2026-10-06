import { describe, expect, it } from "vitest";
import { createI18n, loadLocale } from "@/lib/i18n";
import { SUPPORTED_LANGUAGES, type SupportedLanguage } from "./config";
import { localizeGroupField } from "./groupText";
import en from "./locales/en/translation.json";

const LANGUAGES = Object.keys(SUPPORTED_LANGUAGES) as SupportedLanguage[];

// Only English is bundled; the others load on demand.
await Promise.all(LANGUAGES.map((lang) => loadLocale(lang)));

const official = en.officialGroups as Record<
  string,
  { name: string; description: string }
>;
const MUSIC_CLUB = 21;
const PR_APPLICANTS = 12;

describe("localizeGroupField", () => {
  it("shows the database text in English", () => {
    const i18n = createI18n("en");
    expect(localizeGroupField(i18n, MUSIC_CLUB, "name", "Music Club")).toBe(
      "Music Club",
    );
  });

  it("translates an official group's name and description", () => {
    const i18n = createI18n("ar");
    expect(localizeGroupField(i18n, MUSIC_CLUB, "name", "Music Club")).toBe(
      "نادي الموسيقى",
    );
    expect(
      localizeGroupField(
        i18n,
        MUSIC_CLUB,
        "description",
        official[MUSIC_CLUB].description,
      ),
    ).not.toBe(official[MUSIC_CLUB].description);
  });

  it("ignores stray whitespace in the stored text", () => {
    const i18n = createI18n("es");
    expect(
      localizeGroupField(i18n, PR_APPLICANTS, "name", "PR Applicants\n"),
    ).toBe("Solicitantes de residencia permanente (PR)");
  });

  it("falls back to the database text for a renamed group", () => {
    const i18n = createI18n("ar");
    expect(localizeGroupField(i18n, MUSIC_CLUB, "name", "Jazz Club")).toBe(
      "Jazz Club",
    );
  });

  it("falls back to the database text for a group with no entry", () => {
    const i18n = createI18n("hi");
    expect(localizeGroupField(i18n, 9999, "name", "Hiking Club")).toBe(
      "Hiking Club",
    );
    expect(localizeGroupField(i18n, 9999, "description", "")).toBe("");
  });
});

describe("official group translations", () => {
  it.each(LANGUAGES)("%s has every official group", (lang) => {
    const i18n = createI18n(lang);
    for (const [id, source] of Object.entries(official)) {
      for (const field of ["name", "description"] as const) {
        const shown = localizeGroupField(
          i18n,
          Number(id),
          field,
          source[field],
        );
        expect(shown.trim().length, `${lang} ${id}.${field}`).toBeGreaterThan(
          0,
        );
        if (lang !== "en") {
          expect(shown, `${lang} ${id}.${field}`).not.toBe(source[field]);
        }
      }
    }
  });

  // Official program names stay in English so people can search for them.
  it.each(LANGUAGES)("%s keeps official program names in English", (lang) => {
    const i18n = createI18n(lang);
    const description = localizeGroupField(
      i18n,
      PR_APPLICANTS,
      "description",
      official[PR_APPLICANTS].description,
    );
    for (const term of ["Express Entry", "PNP", "PR"]) {
      expect(description, `${lang}: ${term}`).toContain(term);
    }
    expect(
      localizeGroupField(i18n, PR_APPLICANTS, "name", "PR Applicants"),
    ).toContain("PR");
  });
});
