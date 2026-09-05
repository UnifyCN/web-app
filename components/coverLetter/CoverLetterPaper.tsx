"use client";

import { Plus, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { EditableText } from "@/components/resume/EditableText";
import {
  addParagraph,
  removeParagraph,
  setClosing,
  setContactField,
  setDate,
  setGreeting,
  setParagraph,
  setRecipientField,
  setSignature,
  MAX_PARAGRAPHS,
  type CoverLetterUpdater,
} from "@/lib/coverLetter/editOps";
import type { ResumeContact } from "@/types/resume";
import type { CoverLetterData } from "@/types/coverLetter";

/**
 * Live-rendering cover letter (a clean business-letter layout). Two modes:
 *  - read-only (default): the exact static render used by the PDF print copy.
 *  - editable (`editable` + `onChange`): every field is inline-editable
 *    (contentEditable via EditableText), with add/remove paragraph controls.
 *
 * DOCX exports from CoverLetterData and the print copy from the read-only render,
 * so both automatically reflect manual edits — no export changes needed.
 */

const SERIF = "Georgia, 'Times New Roman', 'Nimbus Roman', serif";

const CONTACT_FIELDS: { field: keyof ResumeContact; ph: string }[] = [
  { field: "phone", ph: "coverLetter.edit.phone" },
  { field: "email", ph: "coverLetter.edit.email" },
  { field: "location", ph: "coverLetter.edit.location" },
  { field: "linkedin", ph: "coverLetter.edit.linkedin" },
  { field: "website", ph: "coverLetter.edit.website" },
];

function contactLine(data: CoverLetterData): string[] {
  const { contact } = data;
  return [contact.phone, contact.email, contact.location, contact.linkedin, contact.website]
    .map((s) => s.trim())
    .filter(Boolean);
}

/* ================================================================== *
 * READ-ONLY render (used by the print copy).
 * ================================================================== */

function ReadOnlyLetter({ data }: { data: CoverLetterData }) {
  const { t } = useTranslation();
  const contacts = contactLine(data);
  const name = data.contact.name.trim() || data.signature.trim();
  const recipientTop = [data.recipient.name, data.recipient.title]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(", ");
  const recipientLines = [
    recipientTop,
    data.recipient.company.trim(),
    data.recipient.location.trim(),
  ].filter(Boolean);

  return (
    <div className="text-[12px] leading-[1.5] text-black">
      <header className="text-center">
        <h1 className="text-[24px] font-bold leading-tight tracking-[0.01em] text-black">
          {name || t("coverLetter.paper.yourName")}
        </h1>
        {contacts.length > 0 && (
          <p className="mt-[4px] text-[11px] text-black">{contacts.join("  |  ")}</p>
        )}
      </header>

      {data.date.trim() && <p className="mt-[26px]">{data.date}</p>}

      {recipientLines.length > 0 && (
        <div className="mt-[18px] space-y-[1px]">
          {recipientLines.map((line, i) => (
            <p key={i}>{line}</p>
          ))}
        </div>
      )}

      {data.greeting.trim() && <p className="mt-[18px]">{data.greeting}</p>}

      <div className="mt-[14px] space-y-[12px]">
        {data.body
          .filter((p) => p.trim())
          .map((p, i) => (
            <p key={i} className="whitespace-pre-wrap">
              {p}
            </p>
          ))}
      </div>

      {data.closing.trim() && <p className="mt-[16px]">{data.closing}</p>}
      {data.signature.trim() && <p className="mt-[4px]">{data.signature}</p>}
    </div>
  );
}

/* ================================================================== *
 * EDITABLE render (on-screen only).
 * ================================================================== */

type Change = (update: CoverLetterUpdater) => void;

function EditableLetter({ data, onChange }: { data: CoverLetterData; onChange: Change }) {
  const { t } = useTranslation();
  return (
    <div className="text-[12px] leading-[1.5] text-black">
      {/* Sender header: name + contact fields. */}
      <header className="text-center">
        <EditableText
          editable
          value={data.contact.name}
          onCommit={(v) => onChange((prev) => setContactField(prev, "name", v))}
          placeholder={t("coverLetter.paper.yourName")}
          ariaLabel={t("coverLetter.paper.yourName")}
          className="text-[24px] font-bold leading-tight tracking-[0.01em] text-black"
        />
        <div className="mt-[4px] flex flex-wrap items-center justify-center gap-x-1.5 gap-y-0.5 text-[11px] text-black">
          {CONTACT_FIELDS.map((f, i) => (
            <span key={f.field} className="inline-flex items-center gap-1.5">
              {i > 0 && <span className="text-ink-placeholder" aria-hidden>|</span>}
              <EditableText
                editable
                value={data.contact[f.field]}
                onCommit={(v) => onChange((prev) => setContactField(prev, f.field, v))}
                placeholder={t(f.ph)}
                ariaLabel={t(f.ph)}
                className="text-[11px] text-black"
              />
            </span>
          ))}
        </div>
      </header>

      {/* Date */}
      <div className="mt-[26px]">
        <EditableText
          editable
          value={data.date}
          onCommit={(v) => onChange((prev) => setDate(prev, v))}
          placeholder={t("coverLetter.edit.date")}
          className="text-[12px] text-black"
        />
      </div>

      {/* Recipient block */}
      <div className="mt-[18px] space-y-[1px]">
        <div className="flex flex-wrap items-baseline gap-x-1.5">
          <EditableText
            editable
            value={data.recipient.name}
            onCommit={(v) => onChange((prev) => setRecipientField(prev, "name", v))}
            placeholder={t("coverLetter.edit.recipientName")}
            className="text-[12px] text-black"
          />
          <span className="text-ink-placeholder" aria-hidden>·</span>
          <EditableText
            editable
            value={data.recipient.title}
            onCommit={(v) => onChange((prev) => setRecipientField(prev, "title", v))}
            placeholder={t("coverLetter.edit.recipientTitle")}
            className="text-[12px] text-black"
          />
        </div>
        <EditableText
          editable
          block
          value={data.recipient.company}
          onCommit={(v) => onChange((prev) => setRecipientField(prev, "company", v))}
          placeholder={t("coverLetter.edit.recipientCompany")}
          className="text-[12px] text-black"
        />
        <EditableText
          editable
          block
          value={data.recipient.location}
          onCommit={(v) => onChange((prev) => setRecipientField(prev, "location", v))}
          placeholder={t("coverLetter.edit.recipientLocation")}
          className="text-[12px] text-black"
        />
      </div>

      {/* Greeting */}
      <div className="mt-[18px]">
        <EditableText
          editable
          block
          value={data.greeting}
          onCommit={(v) => onChange((prev) => setGreeting(prev, v))}
          placeholder={t("coverLetter.edit.greeting")}
          className="text-[12px] text-black"
        />
      </div>

      {/* Body paragraphs */}
      <div className="mt-[14px] space-y-[12px]">
        {data.body.map((p, i) => (
          <div key={i} className="group/p relative">
            <EditableText
              editable
              block
              value={p}
              onCommit={(v) => onChange((prev) => setParagraph(prev, i, v))}
              placeholder={t("coverLetter.edit.paragraph")}
              className="text-[12px] leading-[1.5] text-black"
            />
            <button
              type="button"
              onClick={() => onChange((prev) => removeParagraph(prev, i))}
              aria-label={t("coverLetter.edit.removeParagraph")}
              className="cover-letter-remove-control absolute -end-7 top-0 flex h-6 w-6 items-center justify-center rounded text-ink-placeholder opacity-0 transition-opacity hover:text-destructive focus-visible:opacity-100 group-hover/p:opacity-100"
            >
              <X className="h-3.5 w-3.5" aria-hidden />
            </button>
          </div>
        ))}
        {data.body.length < MAX_PARAGRAPHS && (
          <button
            type="button"
            onClick={() => onChange((prev) => addParagraph(prev))}
            className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary transition-colors hover:text-primary-dark print:hidden"
          >
            <Plus className="h-3 w-3" aria-hidden />
            {t("coverLetter.edit.addParagraph")}
          </button>
        )}
      </div>

      {/* Closing + signature */}
      <div className="mt-[16px]">
        <EditableText
          editable
          block
          value={data.closing}
          onCommit={(v) => onChange((prev) => setClosing(prev, v))}
          placeholder={t("coverLetter.edit.closing")}
          className="text-[12px] text-black"
        />
        <EditableText
          editable
          block
          value={data.signature}
          onCommit={(v) => onChange((prev) => setSignature(prev, v))}
          placeholder={t("coverLetter.edit.signature")}
          className="mt-[4px] text-[12px] text-black"
        />
      </div>
    </div>
  );
}

/* ================================================================== */

export function CoverLetterPaper({
  data,
  editable = false,
  disabled = false,
  onChange,
}: {
  data: CoverLetterData;
  editable?: boolean;
  /** Temporarily block edits (e.g. while an AI turn is in flight). */
  disabled?: boolean;
  onChange?: (update: CoverLetterUpdater) => void;
}) {
  const isEditable = editable && !!onChange;
  return (
    <div
      className={cn(
        "cover-letter-paper mx-auto w-full max-w-[816px] bg-white px-[64px] py-[56px] text-black shadow-sm ring-1 ring-black/5",
        isEditable && "cover-letter-paper-editable",
        isEditable && disabled && "pointer-events-none",
      )}
      style={{ fontFamily: SERIF }}
    >
      {isEditable ? (
        <EditableLetter data={data} onChange={onChange} />
      ) : (
        <ReadOnlyLetter data={data} />
      )}
    </div>
  );
}
