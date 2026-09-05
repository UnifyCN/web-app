/* ------------------------------------------------------------------ *
 * AI Resume Builder — shared types.
 *
 * The resume data model maps to the "Jake's Resume" template (a single-column,
 * ATS-friendly layout): Contact header → Summary (optional) → Education →
 * Experience → Projects (optional) → Skills. `skills` is a list of freeform
 * categories rather than the SWE-fixed "Languages / Frameworks / Tools" so the
 * same template serves trades, healthcare, and service-industry newcomers, not
 * only software engineers.
 *
 * Persistence is LOCAL ONLY for the prototype (localStorage, see
 * services/resume.ts). These types describe both the persisted draft shape and
 * the structured turn the model returns.
 * ------------------------------------------------------------------ */

import type { Persona, Stage } from "@/types";
import type { SupportedLanguage } from "@/lib/i18n/config";

export interface ResumeContact {
  name: string;
  email: string;
  phone: string;
  /** "City, Province" — e.g. "Toronto, ON". */
  location: string;
  /** LinkedIn URL or handle; empty string when not provided. */
  linkedin: string;
  /** Portfolio / GitHub / personal site; empty string when not provided. */
  website: string;
}

export interface ResumeEducation {
  /** Client-assigned stable id (React key + reorder). */
  id: string;
  institution: string;
  /** "City, Country" or "City, Province". */
  location: string;
  /** Degree / program / credential, e.g. "B.A. Economics" or "High School Diploma". */
  degree: string;
  /** Free-form date range, e.g. "Sep 2018 – May 2022" or "2022". */
  dates: string;
}

export interface ResumeExperience {
  id: string;
  /** Job title, e.g. "Retail Sales Associate". */
  title: string;
  organization: string;
  location: string;
  dates: string;
  /** Achievement-oriented bullet points (action verb first). */
  bullets: string[];
}

export interface ResumeProject {
  id: string;
  name: string;
  /** Optional tech / tools summary, shown next to the name. */
  tech: string;
  dates: string;
  bullets: string[];
}

export interface ResumeSkillCategory {
  id: string;
  /** e.g. "Languages", "Certifications", "Technical Skills", "Software". */
  category: string;
  items: string[];
}

/**
 * A target job posting the user is tailoring the resume toward.
 *
 * Client-owned metadata that rides INSIDE the `resume` JSONB (so this needs no
 * DB schema change) but is NEVER authored by the model — the resume-chat edge fn
 * strips unknown fields from the resume it returns, so the send flow re-merges
 * this back onto each returned snapshot. Captured either by a server-side fetch +
 * extraction of a URL (app/api/resume/job-posting) or by the user pasting the
 * description text directly.
 */
export interface ResumeJobPosting {
  /** Source URL, or "" when the user pasted the description text directly. */
  url: string;
  title: string;
  company: string;
  location: string;
  /** Extracted posting text (requirements/responsibilities), capped. */
  text: string;
  /** ISO timestamp the posting was captured. */
  fetchedAt: string;
}

export interface ResumeData {
  contact: ResumeContact;
  /** Optional 1–2 sentence professional summary shown under the header. */
  summary: string;
  education: ResumeEducation[];
  experience: ResumeExperience[];
  projects: ResumeProject[];
  skills: ResumeSkillCategory[];
  /**
   * Optional target job the resume is being tailored toward (client-owned; see
   * ResumeJobPosting). Absent when no job has been attached.
   */
  jobPosting?: ResumeJobPosting;
}

/** Chat roles for the resume conversation. */
export type ResumeChatRole = "user" | "assistant";

export interface ResumeChatMessage {
  /** Local uuid — stable React key (no server bigint here; persistence is local). */
  id: string;
  role: ResumeChatRole;
  content: string;
  /**
   * 2–3 suggested example answers the user can TAP TO FILL the input (they do
   * NOT auto-send, unlike Companion's follow-up chips). Present on assistant
   * turns; absent/empty otherwise.
   */
  suggestions?: string[];
  createdAt: string;
}

/** One saved resume draft (the unit the drafts list selects). */
export interface ResumeDraft {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  resume: ResumeData;
  messages: ResumeChatMessage[];
  /** True once the model signals the resume is reasonably complete. */
  complete: boolean;
}

/** Lightweight row for the drafts list (no messages/resume payload). */
export interface ResumeDraftSummary {
  id: string;
  title: string;
  updatedAt: string;
  complete: boolean;
}

/**
 * The structured JSON the model returns each turn. The model is instructed to
 * return the COMPLETE updated resume (not a patch), preserving all previously
 * captured fields, so the right-hand panel always renders from a full snapshot.
 */
export interface ResumeTurnResponse {
  /** Conversational message shown in the chat (user's language). */
  reply: string;
  /** 0–3 tappable example answers (user's language). */
  suggestions: string[];
  /** Full updated resume (English content). */
  resume: ResumeData;
  /** True when the model judges the resume reasonably complete. */
  complete: boolean;
}

/** Context passed to the turn generator to personalize the conversation. */
export interface ResumeProfileContext {
  firstName: string | null;
  persona: Persona | null;
  stage: Stage | null;
  city: string | null;
  province: string | null;
  /** UI language — the assistant replies + suggestions use it (resume stays English). */
  responseLanguage: SupportedLanguage;
  email: string | null;
}

/** Request body sent to /api/resume (and, later, the resume-chat edge function). */
export interface ResumeTurnRequest {
  /** Prior turns (trimmed), oldest first. */
  history: { role: ResumeChatRole; content: string }[];
  /** The latest user message. */
  message: string;
  /** The resume built so far — the model returns an updated copy. */
  currentResume: ResumeData;
  profile: ResumeProfileContext;
}
