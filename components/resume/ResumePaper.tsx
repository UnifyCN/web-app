"use client";

import { Fragment } from "react";
import {
  Briefcase,
  FolderKanban,
  GraduationCap,
  Plus,
  Trash2,
  Wrench,
  X,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { EditableText } from "./EditableText";
import {
  addBullet,
  addEntry,
  removeBullet,
  removeEntry,
  setBullet,
  setContactField,
  setEducationField,
  setExperienceField,
  setProjectField,
  setSkillCategory,
  setSkillItems,
  setSummary,
  type EntrySection,
  type ResumeUpdater,
} from "@/lib/resume/editOps";
import type {
  ResumeContact,
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
} from "@/types/resume";

/**
 * Live-rendering resume in the "Jake's Resume" style. Two modes:
 *  - read-only (default): the exact static render used by the PDF print copy.
 *  - editable (`editable` + `onChange`): every field is inline-editable
 *    (contentEditable via EditableText), with add/remove controls and a
 *    "+ Add to resume" menu. Manual edits flow through `onChange(updater)`, where
 *    the updater re-applies the edit op to the freshest resume at commit time.
 *
 * DOCX exports from ResumeData and the print copy from the read-only render, so
 * both automatically reflect manual edits — no export changes needed.
 */

const SERIF = "Georgia, 'Times New Roman', 'Nimbus Roman', serif";
/** Mirrors normalizeResumeData's MAX_ENTRIES (schema.ts) so "add" stops at the cap. */
const MAX_ENTRIES = 12;

const CONTACT_FIELDS: { field: keyof ResumeContact; ph: string }[] = [
  { field: "phone", ph: "resume.edit.phone" },
  { field: "email", ph: "resume.edit.email" },
  { field: "location", ph: "resume.edit.location" },
  { field: "linkedin", ph: "resume.edit.linkedin" },
  { field: "website", ph: "resume.edit.website" },
];

function contactLine(data: ResumeData): string[] {
  const { contact } = data;
  return [contact.phone, contact.email, contact.location, contact.linkedin, contact.website]
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

/* ================================================================== *
 * READ-ONLY render (used by the print copy; unchanged behavior).
 * ================================================================== */

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
          <span className="shrink-0 text-[11.5px] italic text-black">{primaryRight}</span>
        )}
      </div>
      {hasSecondary && (
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-[11.5px] italic text-black">{secondaryLeft}</span>
          {secondaryRight?.trim() && (
            <span className="shrink-0 text-[11.5px] italic text-black">{secondaryRight}</span>
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
        <li key={i} className="break-inside-avoid text-[11.5px] leading-[1.35] text-black">
          {b}
        </li>
      ))}
    </ul>
  );
}

function ReadOnlyResume({ data }: { data: ResumeData }) {
  const { t } = useTranslation();
  const contacts = contactLine(data);
  const name = data.contact.name.trim();
  return (
    <>
      <header className="text-center">
        <h1 className="text-[26px] font-bold leading-tight tracking-[0.01em] text-black">
          {name || t("resume.paper.yourName")}
        </h1>
        {contacts.length > 0 && (
          <p className="mt-[4px] text-[11.5px] text-black">{contacts.join("  |  ")}</p>
        )}
      </header>

      {data.summary.trim() && (
        <section>
          <SectionHeading label={t("resume.sections.summary")} />
          <p className="mt-[4px] text-[11.5px] leading-[1.4] text-black">{data.summary}</p>
        </section>
      )}

      {data.education.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.education")} />
          {data.education.map((e) => (
            <div key={e.id} className="break-inside-avoid">
              <EntryHeader
                primaryLeft={e.institution || e.degree || "—"}
                primaryRight={e.location}
                secondaryLeft={e.institution ? e.degree : ""}
                secondaryRight={e.dates}
              />
            </div>
          ))}
        </section>
      )}

      {data.experience.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.experience")} />
          {data.experience.map((e) => (
            <div key={e.id} className="break-inside-avoid">
              <EntryHeader
                primaryLeft={e.title || e.organization || "—"}
                primaryRight={e.dates}
                secondaryLeft={e.title ? e.organization : ""}
                secondaryRight={e.location}
              />
              <Bullets items={e.bullets} />
            </div>
          ))}
        </section>
      )}

      {data.projects.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.projects")} />
          {data.projects.map((p) => (
            <div key={p.id} className="break-inside-avoid">
              <EntryHeader
                primaryLeft={
                  [p.name, p.tech].filter((s) => s.trim()).join("  |  ") || "—"
                }
                primaryRight={p.dates}
              />
              <Bullets items={p.bullets} />
            </div>
          ))}
        </section>
      )}

      {data.skills.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.skills")} />
          <div className="mt-[4px] space-y-[3px]">
            {data.skills.map((s) => (
              <p key={s.id} className="text-[11.5px] leading-[1.35] text-black">
                <span className="font-bold">{s.category}:</span> {s.items.join(", ")}
              </p>
            ))}
          </div>
        </section>
      )}
    </>
  );
}

/* ================================================================== *
 * EDITABLE render (on-screen only).
 * ================================================================== */

type Change = (update: ResumeUpdater) => void;

/** Two-column row with left/right editable cells, matching EntryHeader spacing. */
function EditRow({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return <div className="flex items-baseline justify-between gap-3">{left}{right}</div>;
}

const LEFT_BOLD = "min-w-[1ch] flex-1 text-[12.5px] font-bold text-black";
const LEFT_ITALIC = "min-w-[1ch] flex-1 text-[11.5px] italic text-black";
const RIGHT_ITALIC = "shrink-0 text-right text-[11.5px] italic text-black";

/** Wraps an entry with a hover highlight + remove control. */
function EntryShell({
  onRemove,
  removeLabel,
  children,
}: {
  onRemove: () => void;
  removeLabel: string;
  children: React.ReactNode;
}) {
  return (
    <div className="group relative mt-[8px] -mx-1.5 break-inside-avoid rounded-md px-1.5 transition-colors hover:bg-primary-bg/50">
      {children}
      {/* Remove sits in the right paper gutter (not `end-1`) so it never overlaps
          the top-right editable field — clicking the dates must not delete the entry. */}
      <button
        type="button"
        onClick={onRemove}
        aria-label={removeLabel}
        className="resume-remove-control absolute -end-8 top-0 flex h-6 w-6 items-center justify-center rounded text-ink-placeholder opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary group-hover:opacity-100"
      >
        <Trash2 className="h-3.5 w-3.5" aria-hidden />
      </button>
    </div>
  );
}

function EditBullets({
  onChange,
  section,
  id,
  bullets,
}: {
  onChange: Change;
  section: "experience" | "projects";
  id: string;
  bullets: string[];
}) {
  const { t } = useTranslation();
  return (
    <ul className="mt-[3px] list-disc space-y-[2px] ps-[18px]">
      {bullets.map((b, i) => (
        <li
          key={i}
          className="group/b relative break-inside-avoid text-[11.5px] leading-[1.35] text-black"
        >
          <EditableText
            editable
            value={b}
            onCommit={(v) => onChange((prev) => setBullet(prev, section, id, i, v))}
            placeholder={t("resume.edit.bullet")}
            className="text-[11.5px] leading-[1.35] text-black"
          />
          <button
            type="button"
            onClick={() => onChange((prev) => removeBullet(prev, section, id, i))}
            aria-label={t("resume.edit.removeBullet")}
            className="resume-remove-control ms-1 inline-flex h-4 w-4 items-center justify-center rounded align-middle text-ink-placeholder opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/b:opacity-100"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </li>
      ))}
      <li className="list-none ps-0">
        <button
          type="button"
          onClick={() => onChange((prev) => addBullet(prev, section, id))}
          className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary transition-colors hover:text-primary-dark"
        >
          <Plus className="h-3 w-3" aria-hidden />
          {t("resume.edit.addBullet")}
        </button>
      </li>
    </ul>
  );
}

function AddToResumeMenu({ data, onChange }: { data: ResumeData; onChange: Change }) {
  const { t } = useTranslation();
  const opts: { key: EntrySection; label: string; icon: React.ReactNode }[] = [
    { key: "experience", label: t("resume.edit.addExperience"), icon: <Briefcase className="h-4 w-4" aria-hidden /> },
    { key: "education", label: t("resume.edit.addEducation"), icon: <GraduationCap className="h-4 w-4" aria-hidden /> },
    { key: "projects", label: t("resume.edit.addProject"), icon: <FolderKanban className="h-4 w-4" aria-hidden /> },
    { key: "skills", label: t("resume.edit.addSkill"), icon: <Wrench className="h-4 w-4" aria-hidden /> },
  ];
  const items = opts
    .filter((o) => data[o.key].length < MAX_ENTRIES)
    .map((o) => ({
      key: o.key,
      label: o.label,
      icon: o.icon,
      onSelect: () => onChange((prev) => addEntry(prev, o.key).data),
    }));
  if (items.length === 0) return null;
  return (
    <div className="mt-5 flex justify-center print:hidden">
      <DropdownMenu
        ariaLabel={t("resume.edit.addToResume")}
        align="start"
        triggerClassName="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-3.5 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:border-primary hover:text-primary"
        triggerContent={
          <>
            <Plus className="h-3.5 w-3.5" aria-hidden />
            {t("resume.edit.addToResume")}
          </>
        }
        items={items}
      />
    </div>
  );
}

function EditableResume({ data, onChange }: { data: ResumeData; onChange: Change }) {
  const { t } = useTranslation();
  return (
    <>
      {/* Header: name + all five contact fields (placeholders for empties). */}
      <header className="text-center">
        <EditableText
          editable
          value={data.contact.name}
          onCommit={(v) => onChange((prev) => setContactField(prev, "name", v))}
          placeholder={t("resume.paper.yourName")}
          ariaLabel={t("resume.paper.yourName")}
          className="text-[26px] font-bold leading-tight tracking-[0.01em] text-black"
        />
        <div className="mt-[4px] flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11.5px] text-black">
          {CONTACT_FIELDS.map((f, i) => (
            <Fragment key={f.field}>
              {i > 0 && <span className="text-ink-placeholder" aria-hidden>|</span>}
              <EditableText
                editable
                value={data.contact[f.field]}
                onCommit={(v) => onChange((prev) => setContactField(prev, f.field, v))}
                placeholder={t(f.ph)}
                ariaLabel={t(f.ph)}
                className="text-[11.5px] text-black"
              />
            </Fragment>
          ))}
        </div>
      </header>

      {/* Summary — always shown in edit mode (placeholder when empty). */}
      <section>
        <SectionHeading label={t("resume.sections.summary")} />
        <EditableText
          editable
          block
          value={data.summary}
          onCommit={(v) => onChange((prev) => setSummary(prev, v))}
          placeholder={t("resume.edit.summary")}
          className="mt-[4px] text-[11.5px] leading-[1.4] text-black"
        />
      </section>

      {data.education.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.education")} />
          {data.education.map((e: ResumeEducation) => (
            <EntryShell
              key={e.id}
              onRemove={() => onChange((prev) => removeEntry(prev, "education", e.id))}
              removeLabel={t("resume.edit.removeEntry")}
            >
              <EditRow
                left={<EditableText editable value={e.institution} onCommit={(v) => onChange((prev) => setEducationField(prev, e.id, "institution", v))} placeholder={t("resume.edit.institution")} className={LEFT_BOLD} />}
                right={<EditableText editable value={e.location} onCommit={(v) => onChange((prev) => setEducationField(prev, e.id, "location", v))} placeholder={t("resume.edit.location")} className={RIGHT_ITALIC} />}
              />
              <EditRow
                left={<EditableText editable value={e.degree} onCommit={(v) => onChange((prev) => setEducationField(prev, e.id, "degree", v))} placeholder={t("resume.edit.degree")} className={LEFT_ITALIC} />}
                right={<EditableText editable value={e.dates} onCommit={(v) => onChange((prev) => setEducationField(prev, e.id, "dates", v))} placeholder={t("resume.edit.dates")} className={RIGHT_ITALIC} />}
              />
            </EntryShell>
          ))}
        </section>
      )}

      {data.experience.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.experience")} />
          {data.experience.map((e: ResumeExperience) => (
            <EntryShell
              key={e.id}
              onRemove={() => onChange((prev) => removeEntry(prev, "experience", e.id))}
              removeLabel={t("resume.edit.removeEntry")}
            >
              <EditRow
                left={<EditableText editable value={e.title} onCommit={(v) => onChange((prev) => setExperienceField(prev, e.id, "title", v))} placeholder={t("resume.edit.title")} className={LEFT_BOLD} />}
                right={<EditableText editable value={e.dates} onCommit={(v) => onChange((prev) => setExperienceField(prev, e.id, "dates", v))} placeholder={t("resume.edit.dates")} className={RIGHT_ITALIC} />}
              />
              <EditRow
                left={<EditableText editable value={e.organization} onCommit={(v) => onChange((prev) => setExperienceField(prev, e.id, "organization", v))} placeholder={t("resume.edit.organization")} className={LEFT_ITALIC} />}
                right={<EditableText editable value={e.location} onCommit={(v) => onChange((prev) => setExperienceField(prev, e.id, "location", v))} placeholder={t("resume.edit.location")} className={RIGHT_ITALIC} />}
              />
              <EditBullets onChange={onChange} section="experience" id={e.id} bullets={e.bullets} />
            </EntryShell>
          ))}
        </section>
      )}

      {data.projects.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.projects")} />
          {data.projects.map((p: ResumeProject) => (
            <EntryShell
              key={p.id}
              onRemove={() => onChange((prev) => removeEntry(prev, "projects", p.id))}
              removeLabel={t("resume.edit.removeEntry")}
            >
              <EditRow
                left={
                  <span className="flex min-w-0 flex-1 items-baseline gap-1.5">
                    <EditableText editable value={p.name} onCommit={(v) => onChange((prev) => setProjectField(prev, p.id, "name", v))} placeholder={t("resume.edit.projectName")} className="text-[12.5px] font-bold text-black" />
                    <span className="text-ink-placeholder" aria-hidden>|</span>
                    <EditableText editable value={p.tech} onCommit={(v) => onChange((prev) => setProjectField(prev, p.id, "tech", v))} placeholder={t("resume.edit.tech")} className="text-[11.5px] italic text-black" />
                  </span>
                }
                right={<EditableText editable value={p.dates} onCommit={(v) => onChange((prev) => setProjectField(prev, p.id, "dates", v))} placeholder={t("resume.edit.dates")} className={RIGHT_ITALIC} />}
              />
              <EditBullets onChange={onChange} section="projects" id={p.id} bullets={p.bullets} />
            </EntryShell>
          ))}
        </section>
      )}

      {data.skills.length > 0 && (
        <section>
          <SectionHeading label={t("resume.sections.skills")} />
          <div className="mt-[4px] space-y-[3px]">
            {data.skills.map((s) => (
              <EntryShell
                key={s.id}
                onRemove={() => onChange((prev) => removeEntry(prev, "skills", s.id))}
                removeLabel={t("resume.edit.removeEntry")}
              >
                <p className="text-[11.5px] leading-[1.35] text-black">
                  <EditableText editable value={s.category} onCommit={(v) => onChange((prev) => setSkillCategory(prev, s.id, v))} placeholder={t("resume.edit.skillCategory")} className="font-bold text-black" />
                  <span aria-hidden>: </span>
                  <EditableText editable value={s.items.join(", ")} onCommit={(v) => onChange((prev) => setSkillItems(prev, s.id, v))} placeholder={t("resume.edit.skillItems")} className="text-black" />
                </p>
              </EntryShell>
            ))}
          </div>
        </section>
      )}

      <AddToResumeMenu data={data} onChange={onChange} />
    </>
  );
}

/* ================================================================== */

export function ResumePaper({
  data,
  editable = false,
  disabled = false,
  onChange,
}: {
  data: ResumeData;
  editable?: boolean;
  /** Temporarily block edits (e.g. while an AI turn is in flight) without
   *  flipping the editable layout back to the read-only one. */
  disabled?: boolean;
  onChange?: (update: ResumeUpdater) => void;
}) {
  const isEditable = editable && !!onChange;
  return (
    <div
      className={cn(
        "resume-paper mx-auto w-full max-w-[816px] bg-white px-[52px] py-[44px] text-black shadow-sm ring-1 ring-black/5",
        isEditable && "resume-paper-editable",
        // While an AI turn runs, keep the editable layout but block interaction
        // so a concurrent manual edit can't race the turn's full-resume overwrite.
        isEditable && disabled && "pointer-events-none",
      )}
      style={{ fontFamily: SERIF }}
    >
      {isEditable ? (
        <EditableResume data={data} onChange={onChange} />
      ) : (
        <ReadOnlyResume data={data} />
      )}
    </div>
  );
}
