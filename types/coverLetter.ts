/* ------------------------------------------------------------------ *
 * AI Cover-Letter Generator — shared types.
 *
 * A cover letter is a distinct output from a resume: prose, not structured
 * sections. It reuses the resume feature's building blocks where they fit
 * (`ResumeContact` for the sender header, `ResumeJobPosting` for the target job),
 * but is its own standalone entity — persisted in its own `cover_letters` table
 * (see supabase/migrations/20260904120000_cover_letters.sql), with its own daily
 * quota, mirroring the Resume Builder 1:1.
 *
 * The letter is generated/refined WITH the user through chat: each turn the model
 * returns the COMPLETE updated letter (not a patch), so the live preview always
 * renders from a full snapshot — same contract as the resume turn.
 * ------------------------------------------------------------------ */

import type { Persona, Stage } from "@/types";
import type { SupportedLanguage } from "@/lib/i18n/config";
import type { ResumeContact, ResumeJobPosting } from "@/types/resume";

/** The employer / hiring-manager block a letter is addressed to. */
export interface CoverLetterRecipient {
  /** Hiring manager name, or "" when unknown (→ a generic salutation). */
  name: string;
  /** e.g. "Hiring Manager", "Recruiter". */
  title: string;
  company: string;
  /** "City, Province" or "City, Country". */
  location: string;
}

export interface CoverLetterData {
  /** Sender header — reuses the resume's contact shape (name, email, phone, …). */
  contact: ResumeContact;
  /** Letter date, e.g. "September 4, 2026". Seeded client-side; the model keeps it. */
  date: string;
  recipient: CoverLetterRecipient;
  /** Salutation line, e.g. "Dear Hiring Manager,". */
  greeting: string;
  /** Body paragraphs (the letter proper). */
  body: string[];
  /** Sign-off, e.g. "Sincerely,". */
  closing: string;
  /** Signed name under the closing (defaults to the sender's name). */
  signature: string;
  /**
   * The target job posting this letter tailors to. Client-owned metadata (never
   * authored by the model — the edge fn strips unknown fields, so the send flow
   * re-merges it back), captured via the shared job-posting fetch (URL or paste).
   * Reuses `ResumeJobPosting`.
   */
  jobPosting?: ResumeJobPosting;
  /**
   * Which resume draft was linked as context, so the letter stays consistent with
   * the user's real resume. Client-owned; used to re-load the resume for context
   * on each turn and to show "Using: <resume>" in the editor. Absent = no resume.
   */
  resumeDraftId?: string;
}

/** Chat roles for the cover-letter conversation. */
export type CoverLetterChatRole = "user" | "assistant";

export interface CoverLetterChatMessage {
  id: string;
  role: CoverLetterChatRole;
  content: string;
  /** 2–3 tappable example answers that FILL the input (do not auto-send). */
  suggestions?: string[];
  createdAt: string;
}

/** One saved cover-letter draft (the unit the list selects). */
export interface CoverLetterDraft {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  coverLetter: CoverLetterData;
  messages: CoverLetterChatMessage[];
  /** True once the model signals the letter is reasonably complete. */
  complete: boolean;
}

/** Lightweight row for the list (no messages/letter payload). */
export interface CoverLetterDraftSummary {
  id: string;
  title: string;
  updatedAt: string;
  complete: boolean;
}

/**
 * The structured JSON the model returns each turn. The model returns the COMPLETE
 * updated letter (English content), preserving all prior fields.
 */
export interface CoverLetterTurnResponse {
  /** Conversational message shown in the chat (user's language). */
  reply: string;
  /** 0–3 tappable example answers (user's language). */
  suggestions: string[];
  /** Full updated cover letter (English content). */
  coverLetter: CoverLetterData;
  /** True when the model judges the letter reasonably complete. */
  complete: boolean;
}

/** Context passed to the turn generator to personalize the conversation. */
export interface CoverLetterProfileContext {
  firstName: string | null;
  persona: Persona | null;
  stage: Stage | null;
  city: string | null;
  province: string | null;
  /** UI language — the assistant replies + suggestions use it (letter stays English). */
  responseLanguage: SupportedLanguage;
  email: string | null;
}

/** Request body sent to /api/cover-letter (→ the cover-letter-chat edge function). */
export interface CoverLetterTurnRequest {
  /** Prior turns (trimmed), oldest first. */
  history: { role: CoverLetterChatRole; content: string }[];
  /** The latest user message. */
  message: string;
  /** The letter built so far — the model returns an updated copy. */
  currentCoverLetter: CoverLetterData;
  /**
   * Framed, bounded plain-text summary of the linked resume so the letter matches
   * the user's real experience (built service-side by `buildResumeContext`); "" when
   * no resume is linked.
   */
  resumeContext: string;
  /**
   * The target job-posting fields the letter tailors to (extracted from the
   * letter's `jobPosting`); null when none. Treated as untrusted reference data by
   * the edge fn (labelled so, to blunt prompt injection).
   */
  jobPosting: { title: string; company: string; text: string } | null;
  /** Today's date (client-computed, human-readable) so the letter is dated correctly. */
  todayDate: string;
  profile: CoverLetterProfileContext;
}
