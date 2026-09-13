/**
 * AI Resume Builder data layer.
 *
 * Drafts + the daily message quota live on the shared Supabase DB
 * (`resume_drafts` own-row RLS, `resume_usage` via the resume-chat edge fn),
 * following the Community wiring pattern (Supabase guards, snake_case mappers,
 * localStorage fallback for local dev). The CRUD / quota / job-posting / fallback
 * orchestration is the shared `createDraftService` factory (identical with the
 * Cover Letter Generator — only tokens differ). This file supplies those tokens
 * and keeps the genuinely feature-specific pieces: `newDraft` and the one AI call
 * `generateResumeTurn` → POST /api/resume (proxies the `resume-chat` edge fn).
 */

import { createDraftService } from "@/lib/drafts/createDraftService";
import {
  RESUME_DAILY_MESSAGE_LIMIT,
  RESUME_HISTORY_TURNS,
  emptyResume,
  normalizeResumeData,
} from "@/lib/resume/schema";
import type {
  ResumeChatMessage,
  ResumeData,
  ResumeDraft,
  ResumeDraftSummary,
  ResumeProfileContext,
  ResumeTurnResponse,
} from "@/types/resume";

/** Raised when the daily resume-message cap is hit (server-enforced). */
export class ResumeLimitError extends Error {
  constructor() {
    super("Daily resume-builder limit reached");
    this.name = "ResumeLimitError";
  }
}

/** Raised when the assistant is temporarily unavailable (upstream 5xx/timeout). */
export class ResumeBusyError extends Error {
  constructor() {
    super("The resume assistant is busy");
    this.name = "ResumeBusyError";
  }
}

// Re-exported from its shared home so existing `@/services/resume` importers keep working.
export { JobPostingError } from "@/lib/drafts/errors";

/* ================================================================== *
 * Draft CRUD + quota + job-posting + localStorage fallback (shared factory).
 * ================================================================== */

const service = createDraftService<ResumeData, ResumeChatMessage, ResumeDraft, ResumeDraftSummary>({
  draftsTable: "resume_drafts",
  usageTable: "resume_usage",
  dailyLimit: RESUME_DAILY_MESSAGE_LIMIT,
  storageKey: "unify_resume_drafts_v1",
  notFoundMessage: "Draft not found",
  LimitError: ResumeLimitError,
  draftCols: "id, title, resume, messages, complete, created_at, updated_at",
  payloadColumn: "resume",
  payloadProp: "resume",
  normalize: normalizeResumeData,
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

/** Persist only the resume body + title of an existing draft (transcript untouched). */
export const saveDraftResume = service.saveDraftPayload;

/** Daily message usage for the quota meter. */
export const getResumeUsage = service.getUsage;

/* ================================================================== *
 * Feature-specific: new draft + the one AI call.
 * ================================================================== */

/** Build a brand-new draft. The opener message + prefilled contact are composed
 *  by the caller (the hook) so localization stays in the component layer. */
export function newDraft(args: {
  title: string;
  contact: Partial<ResumeData["contact"]>;
  openerMessage: ResumeChatMessage;
}): ResumeDraft {
  const now = new Date().toISOString();
  return {
    id: crypto.randomUUID(),
    title: args.title,
    createdAt: now,
    updatedAt: now,
    resume: emptyResume(args.contact),
    messages: [args.openerMessage],
    complete: false,
  };
}

export async function generateResumeTurn(args: {
  history: ResumeChatMessage[];
  message: string;
  currentResume: ResumeData;
  profile: ResumeProfileContext;
}): Promise<ResumeTurnResponse> {
  const history = args.history
    .slice(-RESUME_HISTORY_TURNS)
    .map((m) => ({ role: m.role, content: m.content }));

  const res = await fetch("/api/resume", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message: args.message,
      history,
      currentResume: args.currentResume,
      profile: args.profile,
    }),
  });

  if (!res.ok) {
    // 429 = daily cap hit (edge-fn quota RPC); 503/504 = upstream busy/timeout.
    if (res.status === 429) throw new ResumeLimitError();
    if (res.status === 503 || res.status === 504) throw new ResumeBusyError();
    let message = "Failed to generate a reply.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  return (await res.json()) as ResumeTurnResponse;
}
