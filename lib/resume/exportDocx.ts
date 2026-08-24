/**
 * ResumeData → editable Word (.docx) Blob, mirroring the on-screen Jake's-Resume
 * layout (components/resume/ResumePaper.tsx): centered name, contact line, and
 * per section a bold-uppercase heading with a bottom rule, then 2-row entry
 * headers (title/org left, dates/location pushed right via a right tab stop),
 * bullet lists, and skills as "Category: items".
 *
 * `docx` is DYNAMICALLY imported so the ~library only loads when the user
 * actually exports — it stays out of the initial /resume bundle. Output is real,
 * editable Word text (Packer.toBlob), never a flattened image — that's the whole
 * point: users can fix a bullet in Word without another AI turn.
 *
 * Section-heading labels are passed in (resolved from the component's `t()`), so
 * the DOCX matches whatever the on-screen resume + PDF show. Resume *content* is
 * already English (the model guarantees it regardless of UI language).
 */

import type { ResumeData } from "@/types/resume";

export interface ResumeDocxLabels {
  yourName: string;
  summary: string;
  education: string;
  experience: string;
  projects: string;
  skills: string;
}

const FONT = "Georgia";
// Half-point sizes (docx `size` unit): name 22pt, headings 11pt, body 10.5pt.
const SIZE_NAME = 44;
const SIZE_HEADING = 22;
const SIZE_BODY = 21;
const SIZE_META = 20; // italic dates/location

/** Contact line order matches ResumePaper.contactLine (empties filtered). */
function contactLine(data: ResumeData): string {
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

export async function buildResumeDocx(
  data: ResumeData,
  labels: ResumeDocxLabels,
): Promise<Blob> {
  const {
    Document,
    Packer,
    Paragraph,
    TextRun,
    AlignmentType,
    TabStopType,
    TabStopPosition,
    BorderStyle,
  } = await import("docx");

  const children: InstanceType<typeof Paragraph>[] = [];

  // --- Header: name + contact line -----------------------------------------
  children.push(
    new Paragraph({
      alignment: AlignmentType.CENTER,
      spacing: { after: 40 },
      children: [
        new TextRun({
          text: data.contact.name.trim() || labels.yourName,
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
        spacing: { after: 120 },
        children: [new TextRun({ text: contacts, size: SIZE_META, font: FONT })],
      }),
    );
  }

  // --- helpers -------------------------------------------------------------
  const sectionHeading = (label: string) =>
    new Paragraph({
      spacing: { before: 200, after: 40 },
      border: {
        bottom: { style: BorderStyle.SINGLE, size: 6, color: "000000", space: 1 },
      },
      children: [
        new TextRun({
          text: label.toUpperCase(),
          bold: true,
          size: SIZE_HEADING,
          font: FONT,
          characterSpacing: 12,
        }),
      ],
    });

  /** A 2-row entry header; the second row is skipped when both cells are empty. */
  const entryHeader = (
    primaryLeft: string,
    primaryRight: string,
    secondaryLeft: string,
    secondaryRight: string,
  ): InstanceType<typeof Paragraph>[] => {
    const rightTab = [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }];
    const rows: InstanceType<typeof Paragraph>[] = [
      new Paragraph({
        tabStops: rightTab,
        spacing: { before: 120 },
        children: [
          new TextRun({ text: primaryLeft, bold: true, size: SIZE_BODY, font: FONT }),
          ...(primaryRight.trim()
            ? [
                new TextRun({
                  text: `\t${primaryRight}`,
                  italics: true,
                  size: SIZE_META,
                  font: FONT,
                }),
              ]
            : []),
        ],
      }),
    ];
    if (secondaryLeft.trim() || secondaryRight.trim()) {
      rows.push(
        new Paragraph({
          tabStops: rightTab,
          children: [
            new TextRun({
              text: secondaryLeft,
              italics: true,
              size: SIZE_META,
              font: FONT,
            }),
            ...(secondaryRight.trim()
              ? [
                  new TextRun({
                    text: `\t${secondaryRight}`,
                    italics: true,
                    size: SIZE_META,
                    font: FONT,
                  }),
                ]
              : []),
          ],
        }),
      );
    }
    return rows;
  };

  const bulletList = (items: string[]) =>
    items
      .filter((b) => b.trim())
      .map(
        (b) =>
          new Paragraph({
            bullet: { level: 0 },
            spacing: { before: 20 },
            children: [new TextRun({ text: b, size: SIZE_BODY, font: FONT })],
          }),
      );

  // --- Sections (only when non-empty; same order as ResumePaper) -----------
  if (data.summary.trim()) {
    children.push(sectionHeading(labels.summary));
    children.push(
      new Paragraph({
        spacing: { before: 60 },
        children: [new TextRun({ text: data.summary, size: SIZE_BODY, font: FONT })],
      }),
    );
  }

  if (data.education.length > 0) {
    children.push(sectionHeading(labels.education));
    for (const e of data.education) {
      children.push(
        ...entryHeader(
          e.institution || e.degree || "—",
          e.location,
          e.institution ? e.degree : "",
          e.dates,
        ),
      );
    }
  }

  if (data.experience.length > 0) {
    children.push(sectionHeading(labels.experience));
    for (const x of data.experience) {
      children.push(
        ...entryHeader(
          x.title || x.organization || "—",
          x.dates,
          x.title ? x.organization : "",
          x.location,
        ),
        ...bulletList(x.bullets),
      );
    }
  }

  if (data.projects.length > 0) {
    children.push(sectionHeading(labels.projects));
    for (const p of data.projects) {
      const heading = [p.name, p.tech].filter((s) => s.trim()).join("   |   ");
      children.push(
        ...entryHeader(heading || "—", p.dates, "", ""),
        ...bulletList(p.bullets),
      );
    }
  }

  if (data.skills.length > 0) {
    children.push(sectionHeading(labels.skills));
    for (const s of data.skills) {
      children.push(
        new Paragraph({
          spacing: { before: 30 },
          children: [
            new TextRun({
              text: `${s.category}: `,
              bold: true,
              size: SIZE_BODY,
              font: FONT,
            }),
            new TextRun({
              text: s.items.join(", "),
              size: SIZE_BODY,
              font: FONT,
            }),
          ],
        }),
      );
    }
  }

  const doc = new Document({
    creator: "Unify Resume Builder",
    styles: { default: { document: { run: { font: FONT } } } },
    sections: [
      {
        // 0.5in top/bottom, 0.55in sides (twips: 1in = 1440), matching the print CSS.
        properties: {
          page: { margin: { top: 720, right: 792, bottom: 720, left: 792 } },
        },
        children,
      },
    ],
  });

  return Packer.toBlob(doc);
}

/** Safe .docx filename from the resume's name (falls back to "resume"). */
export function resumeDocxFilename(data: ResumeData): string {
  const base =
    data.contact.name.trim().replace(/[^\w\s-]/g, "").replace(/\s+/g, " ").trim() ||
    "resume";
  return `${base}.docx`;
}
