/**
 * Shared .docx building blocks for the Resume Builder and Cover Letter Generator.
 * Both builders use the same serif font, the same centered name + contact-line
 * header, and the same Document/Packer envelope; only sizes, spacing, margins,
 * the creator string, and the body layout differ (those stay in each builder).
 *
 * `docx` is loaded via dynamic import so it stays out of the initial bundle; these
 * helpers import it the same way (the module is cached after first load, so the
 * repeated `await import("docx")` is effectively free).
 *
 * NOT shared: the two filename helpers. `resumeDocxFilename` strips to ASCII
 * (`\w`) while `coverLetterDocxFilename` is NFC + Unicode-aware; unifying them
 * would change the resume's output, so they stay per-builder (divergence noted
 * separately, not "fixed" in this refactor).
 */

import type { Paragraph } from "docx";
import type { ResumeContact } from "@/types/resume";

export const DOCX_FONT = "Georgia";

/** Contact line: phone | email | location | linkedin | website (empties filtered). */
export function contactLine(contact: ResumeContact): string {
  return [
    contact.phone,
    contact.email,
    contact.location,
    contact.linkedin,
    contact.website,
  ]
    .map((s) => s.trim())
    .filter(Boolean)
    .join("   |   ");
}

/**
 * The document's opening paragraphs: a centered, bold name followed by the
 * centered contact line (omitted when empty). The caller resolves the display
 * name (including its fallback) and passes the feature's sizes + the contact
 * line's trailing spacing.
 */
export async function buildHeaderParagraphs(opts: {
  name: string;
  contact: ResumeContact;
  nameSize: number;
  contactSize: number;
  contactSpacingAfter: number;
}): Promise<Paragraph[]> {
  const { Paragraph, TextRun, AlignmentType } = await import("docx");
  const paras: Paragraph[] = [
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: opts.name,
          bold: true,
          size: opts.nameSize,
          font: DOCX_FONT,
        }),
      ],
    }),
  ];
  const contacts = contactLine(opts.contact);
  if (contacts) {
    paras.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: opts.contactSpacingAfter },
        children: [
          new TextRun({ text: contacts, size: opts.contactSize, font: DOCX_FONT }),
        ],
      }),
    );
  }
  return paras;
}

/** Wrap the built paragraphs in a single-section Document (font default + page
 *  margins) and pack to a Blob. */
export async function buildDocument(opts: {
  creator: string;
  margin: { top: number; right: number; bottom: number; left: number };
  children: Paragraph[];
}): Promise<Blob> {
  const { Document, Packer } = await import("docx");
  const doc = new Document({
    creator: opts.creator,
    styles: { default: { document: { run: { font: DOCX_FONT } } } },
    sections: [
      {
        properties: { page: { margin: opts.margin } },
        children: opts.children,
      },
    ],
  });
  return Packer.toBlob(doc);
}
