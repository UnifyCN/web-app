import { describe, expect, it } from "vitest";
import i18next from "i18next";
import en from "@/lib/i18n/locales/en/translation.json";
import ar from "@/lib/i18n/locales/ar/translation.json";
import fr from "@/lib/i18n/locales/fr-CA/translation.json";
import es from "@/lib/i18n/locales/es/translation.json";

// Same plural format as the app (lib/i18n/index.ts: compatibilityJSON "v3").
async function tFor(lng: string) {
  const i = i18next.createInstance();
  await i.init({
    lng,
    fallbackLng: "en",
    compatibilityJSON: "v3",
    resources: {
      en: { translation: en },
      ar: { translation: ar },
      "fr-CA": { translation: fr },
      es: { translation: es },
    },
    interpolation: { escapeValue: false },
  });
  return (count: number) =>
    i.t("checklist.arrivalCountdown.preArrival", { count });
}

describe("countdown copy plurals", () => {
  it("English: 1 day vs 2 days", async () => {
    const t = await tFor("en");
    expect(t(1)).toBe("1 day until you land");
    expect(t(2)).toBe("2 days until you land");
    expect(t(44)).toBe("44 days until you land");
  });

  it("Spanish and French: singular and plural", async () => {
    const es = await tFor("es");
    expect(es(1)).toBe("Falta 1 día para tu llegada");
    expect(es(5)).toBe("Faltan 5 días para tu llegada");
    const fr = await tFor("fr-CA");
    expect(fr(1)).toBe("1 jour avant votre arrivée");
    expect(fr(5)).toBe("5 jours avant votre arrivée");
  });

  it("Arabic: one, two, few and many forms", async () => {
    const t = await tFor("ar");
    expect(t(1)).toBe("تبقّى يوم واحد حتى وصولك");
    expect(t(2)).toBe("تبقّى يومان حتى وصولك");
    expect(t(5)).toBe("تبقّت 5 أيام حتى وصولك");
    expect(t(44)).toBe("تبقّى 44 يومًا حتى وصولك");
  });
});
