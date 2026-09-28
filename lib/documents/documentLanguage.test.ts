import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { I18nextProvider } from "react-i18next";
import JSZip from "jszip";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createI18n } from "@/lib/i18n";
import {
  DEFAULT_DOCUMENT_LANGUAGE,
  documentLanguageStorageKey,
  documentT,
  isDocumentLanguage,
  readDocumentLanguage,
  writeDocumentLanguage,
} from "./documentLanguage";
import { buildResumeDocx, resumeDocxLabels } from "@/lib/resume/exportDocx";
import { ResumePaper } from "@/components/resume/ResumePaper";
import { CoverLetterPaper } from "@/components/coverLetter/CoverLetterPaper";
import { emptyResume } from "@/lib/resume/schema";
import { emptyCoverLetter } from "@/lib/coverLetter/schema";
import type { ResumeData } from "@/types/resume";
import type { CoverLetterData } from "@/types/coverLetter";

// The UI is in Arabic for every test: exports must not follow it.
const arUi = createI18n("ar");

const resume: ResumeData = {
  ...emptyResume(),
  contact: { ...emptyResume().contact, name: "Amal Haddad" },
  summary: "Bilingual customer service lead.",
  education: [
    { id: "e1", institution: "UBC", location: "Vancouver, BC", degree: "BA", dates: "2020" },
  ],
  experience: [
    {
      id: "x1",
      title: "Lead",
      organization: "Acme",
      location: "Surrey, BC",
      dates: "2021 - 2024",
      bullets: ["Led a team of 6"],
    },
  ],
  projects: [{ id: "p1", name: "Portal", tech: "React", dates: "2023", bullets: [] }],
  skills: [{ id: "s1", category: "Languages", items: ["Arabic", "English"] }],
};

async function docxText(blob: Blob): Promise<string> {
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  return (await zip.file("word/document.xml")!.async("string")) ?? "";
}

function printMarkup(el: ReturnType<typeof createElement>): string {
  return renderToStaticMarkup(createElement(I18nextProvider, { i18n: arUi }, el));
}

describe("document language helpers", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("defaults to English and only accepts en / fr-CA", () => {
    expect(DEFAULT_DOCUMENT_LANGUAGE).toBe("en");
    expect(isDocumentLanguage("en")).toBe(true);
    expect(isDocumentLanguage("fr-CA")).toBe(true);
    expect(isDocumentLanguage("ar")).toBe(false);
    expect(isDocumentLanguage(null)).toBe(false);
  });

  it("remembers the choice per draft in localStorage", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("window", {
      localStorage: {
        getItem: (k: string) => store.get(k) ?? null,
        setItem: (k: string, v: string) => void store.set(k, v),
      },
    });
    const a = documentLanguageStorageKey("resume", "draft-a");
    const b = documentLanguageStorageKey("resume", "draft-b");
    expect(readDocumentLanguage(a)).toBe("en");
    writeDocumentLanguage(a, "fr-CA");
    expect(readDocumentLanguage(a)).toBe("fr-CA");
    expect(readDocumentLanguage(b)).toBe("en");
    store.set(b, "ar"); // a tampered / unsupported value falls back
    expect(readDocumentLanguage(b)).toBe("en");
  });

  it("falls back to English when storage throws", () => {
    vi.stubGlobal("window", {
      localStorage: {
        getItem: () => {
          throw new Error("blocked");
        },
      },
    });
    expect(readDocumentLanguage("k")).toBe("en");
  });
});

describe("resume export headings with the UI in Arabic", () => {
  it("DOCX headings are English by default", async () => {
    const xml = await docxText(
      await buildResumeDocx(resume, resumeDocxLabels(documentT(arUi, "en"))),
    );
    for (const h of ["SUMMARY", "EDUCATION", "EXPERIENCE", "PROJECTS", "SKILLS"]) {
      expect(xml).toContain(h);
    }
    expect(xml).not.toContain(arUi.t("resume.sections.experience"));
  });

  it("DOCX headings are French when French is chosen", async () => {
    const xml = await docxText(
      await buildResumeDocx(resume, resumeDocxLabels(documentT(arUi, "fr-CA"))),
    );
    for (const h of ["PROFIL", "FORMATION", "EXPÉRIENCE", "PROJETS", "COMPÉTENCES"]) {
      expect(xml).toContain(h);
    }
  });

  it("DOCX proofing language follows the document language", async () => {
    const styles = async (lang: "en" | "fr-CA") => {
      const blob = await buildResumeDocx(resume, resumeDocxLabels(documentT(arUi, lang)), lang);
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      return zip.file("word/styles.xml")!.async("string");
    };
    expect(await styles("en")).toContain('w:val="en-CA"');
    expect(await styles("fr-CA")).toContain('w:val="fr-CA"');
  });

  it("PDF (print copy) headings are English by default, French when chosen", () => {
    const en = printMarkup(createElement(ResumePaper, { data: resume, docLang: "en" }));
    expect(en).toContain(">Experience<");
    expect(en).toContain(">Skills<");
    expect(en).not.toContain(arUi.t("resume.sections.experience"));

    const fr = printMarkup(createElement(ResumePaper, { data: resume, docLang: "fr-CA" }));
    expect(fr).toContain(">Expérience<");
    expect(fr).toContain(">Compétences<");
  });

  it("the on-screen read-only paper keeps the UI language", () => {
    const screen = printMarkup(createElement(ResumePaper, { data: resume }));
    expect(screen).toContain(arUi.t("resume.sections.experience"));
  });
});

describe("cover letter export with the UI in Arabic", () => {
  const letter: CoverLetterData = { ...emptyCoverLetter(), body: ["I am applying."] };

  it("the print copy's fallback name follows the document language", () => {
    const en = printMarkup(createElement(CoverLetterPaper, { data: letter, docLang: "en" }));
    expect(en).toContain("Your Name");
    const fr = printMarkup(createElement(CoverLetterPaper, { data: letter, docLang: "fr-CA" }));
    expect(fr).toContain("Votre nom");
  });
});
