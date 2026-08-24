/**
 * Resume data shaping + validation, shared by the browser (services/resume.ts),
 * the Next API route (app/api/resume/route.ts), and — in ported form — the
 * resume-chat edge function.
 *
 * The model is asked for strict JSON, but LLM output is never fully trusted:
 * `normalizeResumeData` coerces whatever comes back into a well-formed
 * `ResumeData`, assigns stable ids, and bounds array/bullet sizes so a
 * hallucinated 50-bullet entry can't blow up the UI or the next prompt.
 *
 * No runtime-specific APIs beyond `crypto.randomUUID` (present in Node 20+,
 * Deno, and browsers) so this file stays portable.
 */

import type {
  ResumeData,
  ResumeEducation,
  ResumeExperience,
  ResumeProject,
  ResumeSkillCategory,
} from "@/types/resume";

/** Per-day cap on resume-builder messages (localStorage-tracked). Deliberately
 *  far higher than Companion's 6/day chatbot quota — a full resume is 20+ turns,
 *  so that cap is unusable here. Sized to allow a couple of full resumes/day. */
export const RESUME_DAILY_MESSAGE_LIMIT = 60;

/** Max characters accepted for a single user message (bounds prompt cost). */
export const MAX_RESUME_MESSAGE_LEN = 2000;

/** How many prior turns to send back to the model (bounds prompt size). */
export const RESUME_HISTORY_TURNS = 12;

// Size caps — generous but bounded, applied during normalization.
const MAX_ENTRIES = 12;
const MAX_BULLETS = 10;
const MAX_SKILL_CATEGORIES = 8;
const MAX_SKILL_ITEMS = 20;
const MAX_FIELD_LEN = 400;
const MAX_BULLET_LEN = 400;

function str(value: unknown, max = MAX_FIELD_LEN): string {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, max);
}

function strArray(value: unknown, maxItems: number, maxLen: number): string[] {
  if (!Array.isArray(value)) return [];
  const out: string[] = [];
  for (const item of value) {
    const s = str(item, maxLen);
    if (s) out.push(s);
    if (out.length >= maxItems) break;
  }
  return out;
}

function newId(): string {
  return crypto.randomUUID();
}

/** A blank resume, optionally seeded with prefilled contact fields. */
export function emptyResume(contact?: Partial<ResumeData["contact"]>): ResumeData {
  return {
    contact: {
      name: contact?.name ?? "",
      email: contact?.email ?? "",
      phone: contact?.phone ?? "",
      location: contact?.location ?? "",
      linkedin: contact?.linkedin ?? "",
      website: contact?.website ?? "",
    },
    summary: "",
    education: [],
    experience: [],
    projects: [],
    skills: [],
  };
}

function normalizeEducation(value: unknown): ResumeEducation[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ENTRIES).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(r.id) || newId(),
      institution: str(r.institution),
      location: str(r.location),
      degree: str(r.degree),
      dates: str(r.dates),
    };
  });
}

function normalizeExperience(value: unknown): ResumeExperience[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ENTRIES).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(r.id) || newId(),
      title: str(r.title),
      organization: str(r.organization),
      location: str(r.location),
      dates: str(r.dates),
      bullets: strArray(r.bullets, MAX_BULLETS, MAX_BULLET_LEN),
    };
  });
}

function normalizeProjects(value: unknown): ResumeProject[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_ENTRIES).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(r.id) || newId(),
      name: str(r.name),
      tech: str(r.tech),
      dates: str(r.dates),
      bullets: strArray(r.bullets, MAX_BULLETS, MAX_BULLET_LEN),
    };
  });
}

function normalizeSkills(value: unknown): ResumeSkillCategory[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, MAX_SKILL_CATEGORIES).map((raw) => {
    const r = (raw ?? {}) as Record<string, unknown>;
    return {
      id: str(r.id) || newId(),
      category: str(r.category, 120),
      items: strArray(r.items, MAX_SKILL_ITEMS, 120),
    };
  });
}

/** Coerce arbitrary (model-produced) input into a well-formed ResumeData. */
export function normalizeResumeData(value: unknown): ResumeData {
  const v = (value ?? {}) as Record<string, unknown>;
  const contact = (v.contact ?? {}) as Record<string, unknown>;
  return {
    contact: {
      name: str(contact.name, 120),
      email: str(contact.email, 160),
      phone: str(contact.phone, 60),
      location: str(contact.location, 120),
      linkedin: str(contact.linkedin, 200),
      website: str(contact.website, 200),
    },
    summary: str(v.summary, 600),
    education: normalizeEducation(v.education),
    experience: normalizeExperience(v.experience),
    projects: normalizeProjects(v.projects),
    skills: normalizeSkills(v.skills),
  };
}

/** True when the resume has no substantive content yet (only maybe contact). */
export function isResumeEmpty(resume: ResumeData): boolean {
  return (
    resume.experience.length === 0 &&
    resume.education.length === 0 &&
    resume.projects.length === 0 &&
    resume.skills.length === 0 &&
    !resume.summary.trim()
  );
}
