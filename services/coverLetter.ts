/**
 * AI Cover-Letter Generator data layer.
 *
 * Letters + the daily message quota live on the shared Supabase DB
 * (`cover_letters` own-row RLS, `cover_letter_usage` via the cover-letter-chat
 * edge fn). The CRUD / quota / job-posting / localStorage-fallback orchestration is
 * the shared `createDraftService` factory (identical with the Resume Builder — only
 * tokens differ). This file supplies those tokens and keeps the feature-specific
 * pieces: `newDraft`, `setDraftResumeLink`, and the one AI call
 * `generateCoverLetterTurn` → POST /api/cover-letter (proxies `cover-letter-chat`).
 * The job-posting fetch reuses the feature-neutral /api/resume/job-posting endpoint.
 */

import { createDraftService } from "@/lib/drafts/createDraftService";
import { DocumentImportError } from "@/lib/documents/errors";
import {
  COVER_LETTER_DAILY_MESSAGE_LIMIT,
  COVER_LETTER_HISTORY_TURNS,
  emptyCoverLetter,
  normalizeCoverLetterData,
} from "@/lib/coverLetter/schema";
import type {
  CoverLetterChatMessage,
  CoverLetterData,
  CoverLetterDraft,
  CoverLetterDraftSummary,
  CoverLetterProfileContext,
  CoverLetterTurnResponse,
} from "@/types/coverLetter";

/** Raised when the daily cover-letter-message cap is hit (server-enforced). */
export class CoverLetterLimitError extends Error {
  constructor() {
    super("Daily cover-letter limit reached");
    this.name = "CoverLetterLimitError";
  }
}

/** Raised when the assistant is temporarily unavailable (upstream 5xx/timeout). */
export class CoverLetterBusyError extends Error {
  constructor() {
    super("The cover-letter assistant is busy");
    this.name = "CoverLetterBusyError";
  }
}

// Re-exported so the UI can map job-posting errors without importing from elsewhere.
export { JobPostingError } from "@/lib/drafts/errors";

/* ================================================================== *
 * Draft CRUD + quota + job-posting + localStorage fallback (shared factory).
 * ================================================================== */

const service = createDraftService<
  CoverLetterData,
  CoverLetterChatMessage,
  CoverLetterDraft,
  CoverLetterDraftSummary
>({
  draftsTable: "cover_letters",
  usageTable: "cover_letter_usage",
  dailyLimit: COVER_LETTER_DAILY_MESSAGE_LIMIT,
  storageKey: "unify_cover_letters_v1",
  notFoundMessage: "Cover letter not found",
  LimitError: CoverLetterLimitError,
  draftCols: "id, title, cover_letter, messages, complete, created_at, updated_at",
  payloadColumn: "cover_letter",
  payloadProp: "coverLetter",
  normalize: normalizeCoverLetterData,
});

export const {
  listDrafts,
  getDraft,
  saveDraft,
  deleteDraft,
  renameDraft,
  duplicateDraft,
  fetchJobPosting,
  setDraftJobPosting,
} = service;

/** Persist only the letter body + title of an existing draft (transcript untouched). */
export const saveDraftCoverLetter = service.saveDraftPayload;

/** Daily message usage for the quota meter. */
export const getCoverLetterUsage = service.getUsage;

/* ================================================================== *
 * Feature-specific: new draft, resume link, and the one AI call.
 * ================================================================== */

/** Build a brand-new draft. The opener + seed metadata are composed by the caller
 *  (the hook) so localization stays in the component layer. */
export function newDraft(args: {
  title: string;
  contact: Partial<CoverLetterData["contact"]>;
  date: string;
  signature: string;
  resumeDraftId?: string;
  openerMessage: CoverLetterChatMessage;
}): CoverLetterDraft {
  const now = new Date().toISOString();
  const coverLetter = emptyCoverLetter({
    contact: args.contact,
    date: args.date,
    signature: args.signature,
  });
  if (args.resumeDraftId) coverLetter.resumeDraftId = args.resumeDraftId;
  return {
    id: crypto.randomUUID(),
    title: args.title,
    createdAt: now,
    updatedAt: now,
    coverLetter,
    messages: [args.openerMessage],
    complete: false,
  };
}

/** Set (or clear) which resume draft is linked as context. Stored in the letter
 *  JSONB; leaves the transcript untouched. */
export async function setDraftResumeLink(
  id: string,
  resumeDraftId: string | null,
): Promise<CoverLetterDraft> {
  const current = await getDraft(id);
  if (!current) throw new Error("Cover letter not found");
  const nextLetter: CoverLetterData = { ...current.coverLetter };
  if (resumeDraftId) nextLetter.resumeDraftId = resumeDraftId;
  else delete nextLetter.resumeDraftId;
  return saveDraftCoverLetter(id, nextLetter, current.title);
}

export async function generateCoverLetterTurn(args: {
  history: CoverLetterChatMessage[];
  message: string;
  currentCoverLetter: CoverLetterData;
  resumeContext: string;
  jobPosting: { title: string; company: string; text: string } | null;
  todayDate: string;
  profile: CoverLetterProfileContext;
}): Promise<CoverLetterTurnResponse> {
  const history = args.history
    .slice(-COVER_LETTER_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("/api/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      history,
      currentCoverLetter: args.currentCoverLetter,
      resumeContext: args.resumeContext,
      jobPosting: args.jobPosting,
      todayDate: args.todayDate,
      profile: args.profile,
    }),
  });

  if (!res.ok) {
    if (res.status === 429) throw new CoverLetterLimitError();
    if (res.status === 503 || res.status === 504) throw new CoverLetterBusyError();
    let message = "Failed to generate a reply.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  return (await res.json()) as CoverLetterTurnResponse;
}

/* ================================================================== *
 * Cover-letter import (upload a PDF/DOCX instead of building from scratch).
 * ================================================================== */

export { extractDocumentText } from "@/services/documents";

/**
 * One-shot AI mapping of extracted cover letter text into structured
 * `CoverLetterData`, through the same /api/cover-letter proxy + edge fn as a
 * chat turn (its `importText` branch). Charges one cover_letter_usage message.
 * Throws a typed `DocumentImportError` -- notably `not_a_cover_letter` (422)
 * when the upload mapped to nothing substantive, so the quota is refunded
 * server-side and the UI can say so.
 */
export async function generateImportTurn(args: {
  importText: string;
  todayDate: string;
  profile: CoverLetterProfileContext;
}): Promise<CoverLetterTurnResponse> {
  const res = await fetch("/api/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      importText: args.importText,
      currentCoverLetter: emptyCoverLetter(),
      todayDate: args.todayDate,
      profile: args.profile,
    }),
  });

  if (!res.ok) {
    let code: string | undefined;
    try {
      code = ((await res.json()) as { code?: string }).code;
    } catch {
      // status-based mapping below
    }
    if (res.status === 429) throw new DocumentImportError("daily_limit_reached");
    if (res.status === 422 || code === "not_a_cover_letter") {
      throw new DocumentImportError("not_a_cover_letter");
    }
    if (res.status === 503 || res.status === 504) {
      throw new DocumentImportError("busy");
    }
    if (res.status === 401) throw new DocumentImportError("unauthorized");
    throw new DocumentImportError("generic");
  }

  return (await res.json()) as CoverLetterTurnResponse;
}
