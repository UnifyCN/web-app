/**
 * CoverLetterData → editable Word (.docx) Blob, mirroring the on-screen letter
 * (components/coverLetter/CoverLetterPaper.tsx): centered sender name + contact
 * line, then a left-aligned business letter — date, recipient block, salutation,
 * body paragraphs, closing, and signature.
 *
 * `docx` is DYNAMICALLY imported so the library only loads when the user actually
 * exports — it stays out of the initial /cover-letter bundle. Output is real,
 * editable Word text (Packer.toBlob), never a flattened image.
 *
 * Letter *content* is already English (the model guarantees it regardless of UI
 * language); only the labels here would localize, and a letter has none.
 */

import type { CoverLetterData } from "@/types/coverLetter";

const FONT = "Georgia";
// Half-point sizes: name 20pt, body 11pt, meta 10.5pt.
const SIZE_NAME = 40;
const SIZE_BODY = 22;
const SIZE_META = 21;

/** Contact line order matches CoverLetterPaper (empties filtered). */
function contactLine(data: CoverLetterData): string {
  const { contact } = data;
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

export async function buildCoverLetterDocx(
  data: CoverLetterData,
): Promise<Blob> {
  const { Document, Packer, Paragraph, TextRun, AlignmentType } = await import(
    "docx"
  );

  const children: InstanceType<typeof Paragraph>[] = [];

  const bodyRun = (text: string, opts: { bold?: boolean; italics?: boolean } = {}) =>
    new TextRun({ text, size: SIZE_BODY, font: FONT, ...opts });

  // --- Header: sender name + contact line (centered) -----------------------
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: data.contact.name.trim() || data.signature.trim(),
          bold: true,
          size: SIZE_NAME,
          font: FONT,
        }),
      ],
    }),
  );
  const contacts = contactLine(data);
  if (contacts) {
    children.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 320 },
        children: [new TextRun({ text: contacts, size: SIZE_META, font: FONT })],
      }),
    );
  }

  // --- Date ----------------------------------------------------------------
  if (data.date.trim()) {
    children.push(
      new Paragraph({
        spacing: { after: 240 },
        children: [bodyRun(data.date.trim())],
      }),
    );
  }

  // --- Recipient block -----------------------------------------------------
  const recipientLines = [
    [data.recipient.name, data.recipient.title]
      .map((s) => s.trim())
      .filter(Boolean)
      .join(", "),
    data.recipient.company.trim(),
    data.recipient.location.trim(),
  ].filter(Boolean);
  if (recipientLines.length) {
    recipientLines.forEach((line, i) => {
      children.push(
        new Paragraph({
          spacing: { after: i === recipientLines.length - 1 ? 240 : 0 },
          children: [bodyRun(line)],
        }),
      );
    });
  }

  // --- Greeting ------------------------------------------------------------
  if (data.greeting.trim()) {
    children.push(
      new Paragraph({
        spacing: { after: 200 },
        children: [bodyRun(data.greeting.trim())],
      }),
    );
  }

  // --- Body paragraphs -----------------------------------------------------
  for (const para of data.body) {
    const p = para.trim();
    if (!p) continue;
    children.push(
      new Paragraph({
        spacing: { after: 200, line: 276 },
        children: [bodyRun(p)],
      }),
    );
  }

  // --- Closing + signature -------------------------------------------------
  if (data.closing.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: 120, after: data.signature.trim() ? 0 : 200 },
        children: [bodyRun(data.closing.trim())],
      }),
    );
  }
  if (data.signature.trim()) {
    children.push(
      new Paragraph({
        spacing: { before: data.closing.trim() ? 240 : 120 },
        children: [bodyRun(data.signature.trim())],
      }),
    );
  }

  const doc = new Document({
    creator: "Unify Cover Letter Generator",
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [
      {
        // 1in top/bottom, 1in sides (twips: 1in = 1440) — standard letter margins.
        properties: {
          page: { margin: { top: 1440, right: 1440, bottom: 1440, left: 1440 } },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/** Safe .docx filename from the sender's name + target company. Keeps Unicode
 *  letters/numbers (many newcomers have non-ASCII names) and drops only
 *  punctuation/symbols that are unsafe in filenames. */
export function coverLetterDocxFilename(data: CoverLetterData): string {
  // NFC-normalize first (collapses decomposed sequences where a precomposed form
  // exists) and keep combining marks (\p{M}) for scripts that have none, so a
  // diacritic like the "ä" in "Äna" survives regardless of input normalization.
  const clean = (s: string) =>
    s.normalize("NFC").replace(/[^\p{L}\p{N}\p{M}\s-]/gu, "").replace(/\s+/g, " ").trim();
  const name = clean(data.contact.name || data.signature);
  const company = clean(data.jobPosting?.company || data.recipient.company);
  const base = [name, company, "cover letter"].filter(Boolean).join(" - ");
  return `${base || "cover-letter"}.docx`;
}
