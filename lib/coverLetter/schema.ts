/**
 * Cover-letter shaping + validation, shared by the browser
 * (services/coverLetter.ts), the Next API route (app/api/cover-letter/route.ts),
 * and — in ported form — the cover-letter-chat edge function.
 *
 * As with the resume, LLM output is never fully trusted: `normalizeCoverLetterData`
 * coerces whatever comes back into a well-formed `CoverLetterData` and bounds
 * every field so a hallucinated payload can't blow up the UI or the next prompt.
 * Mirrors lib/resume/schema.ts — keep the two in sync where they overlap.
 *
 * No runtime-specific APIs beyond `crypto.randomUUID` (Node 20+, Deno, browsers)
 * so this file stays portable across the app + edge fn.
 */

import { normalizeJobPosting } from "@/lib/resume/schema";
import type { CoverLetterData, CoverLetterRecipient } from "@/types/coverLetter";
import type { ResumeData } from "@/types/resume";

/** Per-day cap on cover-letter messages (server-enforced). Lower than the resume
 *  60/day: a letter is generate-then-refine (a handful of turns), not a 20+ turn
 *  interview — bounded so the new AI cost surface stays small. */
export const COVER_LETTER_DAILY_MESSAGE_LIMIT = 30;

/** Max characters accepted for a single user message (bounds prompt cost). */
export const MAX_COVER_LETTER_MESSAGE_LEN = 2000;

/** How many prior turns to send back to the model (bounds prompt size). */
export const COVER_LETTER_HISTORY_TURNS = 12;

// Size caps — generous but bounded, applied during normalization.
const MAX_PARAGRAPHS = 8;
const MAX_PARAGRAPH_LEN = 1600;
const MAX_FIELD_LEN = 400;

function str(value: unknown, max = MAX_FIELD_LEN): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function emptyRecipient(): CoverLetterRecipient {
  return { name: "", title: "", company: "", location: "" };
}

/** A blank cover letter, optionally seeded with sender/date/target metadata. */
export function emptyCoverLetter(seed?: {
  contact?: Partial<CoverLetterData["contact"]>;
  date?: string;
  signature?: string;
}): CoverLetterData {
  return {
    contact: {
      name: seed?.contact?.name ?? "",
      email: seed?.contact?.email ?? "",
      phone: seed?.contact?.phone ?? "",
      location: seed?.contact?.location ?? "",
      linkedin: seed?.contact?.linkedin ?? "",
      website: seed?.contact?.website ?? "",
    },
    date: seed?.date ?? "",
    recipient: emptyRecipient(),
    greeting: "",
    body: [],
    closing: "",
    signature: seed?.signature ?? seed?.contact?.name ?? "",
  };
}

function normalizeRecipient(value: unknown): CoverLetterRecipient {
  const r = (value ?? {}) as Record<string, unknown>;
  return {
    name: str(r.name, 160),
    title: str(r.title, 120),
    company: str(r.company, 160),
    location: str(r.location, 160),
  };
}

function normalizeBody(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const p = str(item, MAX_PARAGRAPH_LEN);
    if (p) out.push(p);
    if (out.length >= MAX_PARAGRAPHS) break;
  }
  return out;
}

/** Coerce arbitrary (model-produced) input into a well-formed CoverLetterData. */
export function normalizeCoverLetterData(value: unknown): CoverLetterData {
  const v = (value ?? {}) as Record<string, unknown>;
  const contact = (v.contact ?? {}) as Record<string, unknown>;
  const out: CoverLetterData = {
    contact: {
      name: str(contact.name, 120),
      email: str(contact.email, 160),
      phone: str(contact.phone, 60),
      location: str(contact.location, 120),
      linkedin: str(contact.linkedin, 200),
      website: str(contact.website, 200),
    },
    date: str(v.date, 60),
    recipient: normalizeRecipient(v.recipient),
    greeting: str(v.greeting, 200),
    body: normalizeBody(v.body),
    closing: str(v.closing, 60),
    signature: str(v.signature, 120),
  };
  // Client-owned metadata — reuse the resume job-posting normalizer (bounded,
  // never model-authored; re-merged after each turn like the resume's).
  const jobPosting = normalizeJobPosting(v.jobPosting);
  if (jobPosting) out.jobPosting = jobPosting;
  const resumeDraftId = str(v.resumeDraftId, 64);
  if (resumeDraftId) out.resumeDraftId = resumeDraftId;
  return out;
}

/** True when the letter has no substantive body yet. */
export function isCoverLetterEmpty(letter: CoverLetterData): boolean {
  return letter.body.filter((p) => p.trim()).length === 0;
}

/** How much of the resume context to include in a turn — bounded so the framed
 *  reference block can't balloon the prompt. */
const RESUME_CONTEXT_BUDGET = 3000;

/**
 * Frame a linked resume as a compact plain-text reference block for the letter
 * generator. Trusted data (the user's own resume), but still bounded. Returns ""
 * when there's nothing substantive to pass. Kept here (not in the edge fn) so the
 * bounding is shared and testable; the edge fn labels it as reference context.
 */
export function buildResumeContext(resume: ResumeData | null | undefined): string {
  if (!resume) return "";
  const lines: string[] = [];
  const name = resume.contact.name.trim();
  if (name) lines.push(`Name: ${name}`);
  if (resume.summary.trim()) lines.push(`Summary: ${resume.summary.trim()}`);

  if (resume.experience.length) {
    lines.push("Experience:");
    for (const e of resume.experience) {
      const head = [e.title, e.organization, e.dates]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" — ");
      if (head) lines.push(`- ${head}`);
      for (const b of e.bullets) {
        const bt = b.trim();
        if (bt) lines.push(`  • ${bt}`);
      }
    }
  }
  if (resume.education.length) {
    lines.push("Education:");
    for (const ed of resume.education) {
      const head = [ed.degree, ed.institution, ed.dates]
        .map((s) => s.trim())
        .filter(Boolean)
        .join(" — ");
      if (head) lines.push(`- ${head}`);
    }
  }
  if (resume.skills.length) {
    const skills = resume.skills
      .map((s) => {
        const items = s.items.join(", ").trim();
        return items ? `${s.category}: ${items}` : s.category;
      })
      .filter(Boolean)
      .join("; ");
    if (skills) lines.push(`Skills: ${skills}`);
  }
  return lines.join("\n").slice(0, RESUME_CONTEXT_BUDGET);
}
