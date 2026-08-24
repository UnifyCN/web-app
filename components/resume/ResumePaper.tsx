"use client";

import { useTranslation } from "react-i18next";
import type {
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
} from "@/types/resume";

/**
 * Live-rendering resume in the "Jake's Resume" style: single column, serif type
 * (Latin-Modern-like), centered contact header, small-caps section headings with
 * a full-width rule, and 2-row entry headers (title/dates over subtitle/location).
 *
 * Renders straight from ResumeData — every section is omitted when empty, and
 * entry rows degrade gracefully when a field the user never gave (employer, dates,
 * location) is blank, so a partial resume never shows a dangling "@" or empty rule.
 *
 * The root carries `resume-paper`; a print stylesheet (globals.css) isolates that
 * node so "Download PDF" (window.print) exports just the resume with real,
 * selectable, ATS-friendly text — no rasterization.
 */

const SERIF = "Georgia, 'Times New Roman', 'Nimbus Roman', serif";

function contactLine(data: ResumeData): string[] {
  const { contact } = data;
  return [
    contact.phone,
    contact.email,
    contact.location,
    contact.linkedin,
    contact.website,
  ]
    .map((s) => s.trim())
    .filter(Boolean);
}

function SectionHeading({ label }: { label: string }) {
  return (
    <h2
      className="mt-[18px] mb-[6px] border-b border-black pb-[2px] text-[12.5px] font-bold uppercase tracking-[0.06em] text-black"
      style={{ fontFamily: SERIF }}
    >
      {label}
    </h2>
  );
}

/** 2-row entry header; each cell is skipped when its value is empty. */
function EntryHeader({
  primaryLeft,
  primaryRight,
  secondaryLeft,
  secondaryRight,
}: {
  primaryLeft: string;
  primaryRight?: string;
  secondaryLeft?: string;
  secondaryRight?: string;
}) {
  const hasSecondary = Boolean(secondaryLeft?.trim() || secondaryRight?.trim());
  return (
    <div className="mt-[8px]">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-[12.5px] font-bold text-black">{primaryLeft}</span>
        {primaryRight?.trim() && (
          <span className="shrink-0 text-[11.5px] italic text-black">
            {primaryRight}
          </span>
        )}
      </div>
      {hasSecondary && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11.5px] italic text-black">
            {secondaryLeft}
          </span>
          {secondaryRight?.trim() && (
            <span className="shrink-0 text-[11.5px] italic text-black">
              {secondaryRight}
            </span>
          )}
        </div>
      )}
    </div>
  );
}

function Bullets({ items }: { items: string[] }) {
  const bullets = items.filter((b) => b.trim());
  if (bullets.length === 0) return null;
  return (
    <ul className="mt-[3px] list-disc space-y-[2px] ps-[18px]">
      {bullets.map((b, i) => (
        <li key={i} className="text-[11.5px] leading-[1.35] text-black">
          {b}
        </li>
      ))}
    </ul>
  );
}

function ExperienceEntry({ item }: { item: ResumeExperience }) {
  return (
    <div>
      <EntryHeader
        primaryLeft={item.title || item.organization || "—"}
        primaryRight={item.dates}
        secondaryLeft={item.title ? item.organization : ""}
        secondaryRight={item.location}
      />
      <Bullets items={item.bullets} />
    </div>
  );
}

function EducationEntry({ item }: { item: ResumeEducation }) {
  return (
    <EntryHeader
      primaryLeft={item.institution || item.degree || "—"}
      primaryRight={item.location}
      secondaryLeft={item.institution ? item.degree : ""}
      secondaryRight={item.dates}
    />
  );
}

function ProjectEntry({ item }: { item: ResumeProject }) {
  const heading = [item.name, item.tech].filter((s) => s.trim()).join("  |  ");
  return (
    <div>
      <EntryHeader primaryLeft={heading || "—"} primaryRight={item.dates} />
      <Bullets items={item.bullets} />
    </div>
  );
}

export function ResumePaper({ data }: { data: ResumeData }) {
  const { t } = useTranslation();
  const contacts = contactLine(data);
  const name = data.contact.name.trim();

  return (
    <div
      className="resume-paper mx-auto w-full max-w-[816px] bg-white px-[52px] py-[44px] text-black shadow-sm ring-1 ring-black/5"
      style={{ fontFamily: SERIF }}
    >
      {/* Header */}
      <header className="text-center">
        <h1 className="text-[26px] font-bold leading-tight tracking-[0.01em] text-black">
          {name || t("resume.paper.yourName")}
        </h1>
        {contacts.length > 0 && (
          <p className="mt-[4px] text-[11.5px] text-black">
            {contacts.join("  |  ")}
          </p>
        )}
      </header>

      {data.summary.trim() && (
        <section>
          <SectionHeading label={t("resume.sections.summary")} />
          <p className="mt-[4px] text-[11.5px] leading-[1.4] text-black">
            {data.summary}
          </p>
        </section>
      )}

      {data.education.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.education")} />
          {data.education.map((e) => (
            <EducationEntry key={e.id} item={e} />
          ))}
        </section>
      )}

      {data.experience.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.experience")} />
          {data.experience.map((e) => (
            <ExperienceEntry key={e.id} item={e} />
          ))}
        </section>
      )}

      {data.projects.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.projects")} />
          {data.projects.map((p) => (
            <ProjectEntry key={p.id} item={p} />
          ))}
        </section>
      )}

      {data.skills.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.skills")} />
          <div className="mt-[4px] space-y-[3px]">
            {data.skills.map((s) => (
              <p key={s.id} className="text-[11.5px] leading-[1.35] text-black">
                <span className="font-bold">{s.category}:</span>{" "}
                {s.items.join(", ")}
              </p>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
