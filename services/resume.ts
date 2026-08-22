/**
 * AI Resume Builder data layer — LOCAL ONLY for the prototype.
 *
 * Drafts, chat transcripts, and the daily rate-limit counter all live in
 * localStorage (no Supabase table — a shared-DB schema change needs Savar's
 * sign-off). The shape here mirrors what a future `resume_drafts` table +
 * `resume_usage` quota would hold, so the migration is a swap of these read/
 * write bodies for Supabase calls — the hooks/components above don't change.
 *
 * The one network call is generateResumeTurn → POST /api/resume (the DeepSeek
 * turn). Everything else is synchronous localStorage access, wrapped in async
 * signatures so the React Query hooks read identically to the Companion ones.
 */

import {
  RESUME_DAILY_MESSAGE_LIMIT,
  RESUME_HISTORY_TURNS,
  emptyResume,
} from "@/lib/resume/schema";
import type {
  ResumeChatMessage,
  ResumeData,
  ResumeDraft,
  ResumeDraftSummary,
  ResumeProfileContext,
  ResumeTurnResponse,
} from "@/types/resume";

const DRAFTS_KEY = "unify_resume_drafts_v1";
const USAGE_KEY = "unify_resume_usage_v1";

/** Raised when the daily resume-message cap is hit (client-enforced). */
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

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readDrafts(): ResumeDraft[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as ResumeDraft[]) : [];
  } catch {
    return [];
  }
}

function writeDrafts(drafts: ResumeDraft[]): void {
  if (!hasStorage()) return;
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
  } catch {
    // Quota / private-mode failures are non-fatal for a prototype.
  }
}

/** Newest-first list of lightweight draft rows for the sidebar. */
export async function listDrafts(): Promise<ResumeDraftSummary[]> {
  return readDrafts()
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((d) => ({
      id: d.id,
      title: d.title,
      updatedAt: d.updatedAt,
      complete: d.complete,
    }));
}

export async function getDraft(id: string): Promise<ResumeDraft | null> {
  return readDrafts().find((d) => d.id === id) ?? null;
}

/** Persist a full draft (create or replace), stamping updatedAt. */
export async function saveDraft(draft: ResumeDraft): Promise<ResumeDraft> {
  const stamped = { ...draft, updatedAt: new Date().toISOString() };
  const drafts = readDrafts();
  const idx = drafts.findIndex((d) => d.id === stamped.id);
  if (idx === -1) drafts.push(stamped);
  else drafts[idx] = stamped;
  writeDrafts(drafts);
  return stamped;
}

export async function deleteDraft(id: string): Promise<void> {
  writeDrafts(readDrafts().filter((d) => d.id !== id));
}

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

/* ----- Rate limit (per calendar day, local) ------------------------------- */

interface UsageRecord {
  date: string; // YYYY-MM-DD
  count: number;
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

function readUsage(): UsageRecord {
  if (!hasStorage()) return { date: today(), count: 0 };
  try {
    const raw = window.localStorage.getItem(USAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as UsageRecord;
      if (parsed?.date === today()) return parsed;
    }
  } catch {
    // fall through to a fresh record
  }
  return { date: today(), count: 0 };
}

export async function getResumeUsage(): Promise<{
  count: number;
  remaining: number;
}> {
  const { count } = readUsage();
  return { count, remaining: Math.max(0, RESUME_DAILY_MESSAGE_LIMIT - count) };
}

function incrementUsage(): void {
  if (!hasStorage()) return;
  const usage = readUsage();
  const next: UsageRecord = { date: usage.date, count: usage.count + 1 };
  try {
    window.localStorage.setItem(USAGE_KEY, JSON.stringify(next));
  } catch {
    // non-fatal
  }
}

/* ----- The one network call: a DeepSeek turn ------------------------------ */

export async function generateResumeTurn(args: {
  history: ResumeChatMessage[];
  message: string;
  currentResume: ResumeData;
  profile: ResumeProfileContext;
}): Promise<ResumeTurnResponse> {
  // Client-side daily cap — checked before spending an OpenRouter call.
  const { remaining } = await getResumeUsage();
  if (remaining <= 0) throw new ResumeLimitError();

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
    // 503 = upstream busy/timeout (retryable); surface a distinct busy error so
    // the UI can say "try again" rather than a generic failure.
    if (res.status === 503) throw new ResumeBusyError();
    let message = "Failed to generate a reply.";
    try {
      const body = (await res.json()) as { error?: string };
      if (body?.error) message = body.error;
    } catch {
      // keep the generic message
    }
    throw new Error(message);
  }

  const data = (await res.json()) as ResumeTurnResponse;
  // Count a successful turn against the daily cap.
  incrementUsage();
  return data;
}
