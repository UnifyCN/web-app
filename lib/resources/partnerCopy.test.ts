import { describe, expect, it } from "vitest";
import en from "@/lib/i18n/locales/en/translation.json";
import ar from "@/lib/i18n/locales/ar/translation.json";
import es from "@/lib/i18n/locales/es/translation.json";
import frCA from "@/lib/i18n/locales/fr-CA/translation.json";
import hi from "@/lib/i18n/locales/hi/translation.json";
import pa from "@/lib/i18n/locales/pa/translation.json";
import vi from "@/lib/i18n/locales/vi/translation.json";
import { PARTNERS } from "./partners";
import { programKeySegment } from "./localizePartner";

type Copy = Record<string, { programs?: Record<string, { name?: string }> } & Record<string, unknown>>;
const copyOf = (bundle: unknown) =>
  (bundle as { resources: { partners: Copy } }).resources.partners;

const LOCALES = { en, ar, es, "fr-CA": frCA, hi, pa, vi };

// Ported from mobile __tests__/resources/partnerCopy.test.ts: the structure in
// partners.ts and the copy in the locale files must match in both directions.
describe("partner copy", () => {
  const enCopy = copyOf(en);

  it("has an English block with the required fields for every partner", () => {
    for (const p of PARTNERS) {
      const block = enCopy[p.slug];
      expect(block, p.slug).toBeDefined();
      for (const field of ["tagline", "description", "serviceArea"]) {
        expect(typeof block[field], `${p.slug}.${field}`).toBe("string");
      }
    }
  });

  it("has an English name for every program", () => {
    for (const p of PARTNERS) {
      for (const program of p.programs ?? []) {
        const seg = programKeySegment(p.slug, program.id);
        expect(program.id.startsWith(`${p.slug}-`), program.id).toBe(true);
        expect(enCopy[p.slug].programs?.[seg]?.name, program.id).toBeTruthy();
      }
    }
  });

  it("has no copy block without a partner record", () => {
    const slugs = new Set(PARTNERS.map((p) => p.slug));
    for (const slug of Object.keys(enCopy)) expect(slugs.has(slug), slug).toBe(true);
  });

  it("ships a block for every partner in every locale", () => {
    for (const [lang, bundle] of Object.entries(LOCALES)) {
      const copy = copyOf(bundle);
      for (const p of PARTNERS) expect(copy[p.slug], `${lang}:${p.slug}`).toBeDefined();
    }
  });
});
