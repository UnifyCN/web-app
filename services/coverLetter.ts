/**
 * AI Cover-Letter Generator data layer.
 *
 * Letters + the daily message quota live on the shared Supabase DB
 * (`cover_letters` own-row RLS, `cover_letter_usage` via the cover-letter-chat
 * edge fn), following the Community wiring pattern: `isSupabaseConfigured()` +
 * `getAuthUserId()` guards, snake_case row mappers, and a localStorage fallback
 * for the env-not-configured / local-dev case. React Query is the optimistic
 * cache — no separate localStorage cache layer.
 *
 * A standalone sibling of services/resume.ts. The job-posting fetch reuses the
 * feature-neutral /api/resume/job-posting endpoint (SSRF-guarded, size-capped);
 * `JobPostingError` is shared. The one AI call is generateCoverLetterTurn →
 * POST /api/cover-letter, which proxies the shared `cover-letter-chat` edge fn.
 */

import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import {
  COVER_LETTER_DAILY_MESSAGE_LIMIT,
  COVER_LETTER_HISTORY_TURNS,
  emptyCoverLetter,
  normalizeCoverLetterData,
} from "@/lib/coverLetter/schema";
import { JobPostingError } from "@/services/resume";
import type {
  CoverLetterChatMessage,
  CoverLetterData,
  CoverLetterDraft,
  CoverLetterDraftSummary,
  CoverLetterProfileContext,
  CoverLetterTurnResponse,
} from "@/types/coverLetter";
import type { ResumeJobPosting } from "@/types/resume";

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

// Re-exported so the UI can map job-posting errors without importing from the
// resume service.
export { JobPostingError };

/* ================================================================== *
 * Supabase context — null when unconfigured or signed out (→ fallback).
 * ================================================================== */

async function authed(): Promise<{
  supabase: ReturnType<typeof createClient>;
  userId: string;
} | null> {
  if (!isSupabaseConfigured()) return null;
  const userId = await getAuthUserId();
  if (!userId) return null;
  return { supabase: createClient(), userId };
}

interface CoverLetterRow {
  id: string;
  title: string;
  cover_letter: CoverLetterData;
  messages: CoverLetterChatMessage[] | null;
  complete: boolean;
  created_at: string;
  updated_at: string;
}

function rowToDraft(row: CoverLetterRow): CoverLetterDraft {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    coverLetter: normalizeCoverLetterData(row.cover_letter),
    messages: Array.isArray(row.messages) ? row.messages : [],
    complete: row.complete,
  };
}

const DRAFT_COLS =
  "id, title, cover_letter, messages, complete, created_at, updated_at";

/* ================================================================== *
 * Drafts.
 * ================================================================== */

/** Newest-first list of lightweight rows for the list page. */
export async function listDrafts(): Promise<CoverLetterDraftSummary[]> {
  const ctx = await authed();
  if (!ctx) return localListDrafts();

  const { data, error } = await ctx.supabase
    .from("cover_letters")
    .select("id, title, updated_at, complete")
    .order("updated_at", { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => ({
    id: r.id as string,
    title: r.title as string,
    updatedAt: r.updated_at as string,
    complete: r.complete as boolean,
  }));
}

export async function getDraft(id: string): Promise<CoverLetterDraft | null> {
  const ctx = await authed();
  if (!ctx) return localGetDraft(id);

  const { data, error } = await ctx.supabase
    .from("cover_letters")
    .select(DRAFT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDraft(data as unknown as CoverLetterRow) : null;
}

/** Persist a full draft (create or replace), stamping updatedAt. */
export async function saveDraft(
  draft: CoverLetterDraft,
): Promise<CoverLetterDraft> {
  const ctx = await authed();
  if (!ctx) return localSaveDraft(draft);

  const updatedAt = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("cover_letters")
    .upsert(
      {
        id: draft.id,
        user_id: ctx.userId,
        title: draft.title,
        cover_letter: normalizeCoverLetterData(draft.coverLetter),
        messages: draft.messages,
        complete: draft.complete,
        created_at: draft.createdAt,
        updated_at: updatedAt,
      },
      { onConflict: "id" },
    )
    .select(DRAFT_COLS)
    .single();
  if (error) throw error;
  return rowToDraft(data as unknown as CoverLetterRow);
}

export async function deleteDraft(id: string): Promise<void> {
  const ctx = await authed();
  if (!ctx) return localDeleteDraft(id);

  const { error } = await ctx.supabase
    .from("cover_letters")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Persist only the letter body + (already-derived) title of an existing draft,
 * leaving the chat transcript + other fields untouched. Callers serialize these
 * so the final commit wins.
 */
export async function saveDraftCoverLetter(
  id: string,
  nextLetter: CoverLetterData,
  title: string,
): Promise<CoverLetterDraft> {
  const ctx = await authed();
  if (!ctx) return localSaveDraftCoverLetter(id, nextLetter, title);

  const { data, error } = await ctx.supabase
    .from("cover_letters")
    .update({
      cover_letter: normalizeCoverLetterData(nextLetter),
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(DRAFT_COLS)
    .single();
  if (error) throw error;
  return rowToDraft(data as unknown as CoverLetterRow);
}

/** Rename a draft (title only). */
export async function renameDraft(
  id: string,
  title: string,
): Promise<CoverLetterDraft> {
  const ctx = await authed();
  if (!ctx) return localRenameDraft(id, title);

  const { data, error } = await ctx.supabase
    .from("cover_letters")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(DRAFT_COLS)
    .single();
  if (error) throw error;
  return rowToDraft(data as unknown as CoverLetterRow);
}

/**
 * Duplicate a draft into a brand-new, fully independent row. Same ownership
 * integrity as the resume duplicate: read + write in one captured auth context,
 * clone `user_id` PINNED to the reader, single `insert` (fails closed on a
 * mid-op auth flip via the RLS with-check).
 */
export async function duplicateDraft(
  id: string,
  title: string,
): Promise<CoverLetterDraft> {
  const ctx = await authed();
  if (!ctx) return localDuplicateDraft(id, title);

  const { data: src, error: readError } = await ctx.supabase
    .from("cover_letters")
    .select(DRAFT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!src) throw new Error("Cover letter not found");
  const source = rowToDraft(src as unknown as CoverLetterRow);

  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("cover_letters")
    .insert({
      id: crypto.randomUUID(),
      user_id: ctx.userId,
      title,
      cover_letter: normalizeCoverLetterData(source.coverLetter),
      messages: source.messages.map((m) => ({ ...m, id: crypto.randomUUID() })),
      complete: false,
      created_at: now,
      updated_at: now,
    })
    .select(DRAFT_COLS)
    .single();
  if (error) throw error;
  return rowToDraft(data as unknown as CoverLetterRow);
}

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

/* ================================================================== *
 * Daily message quota — read the row the edge function writes.
 * ================================================================== */

function utcDay(iso: string | Date): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export async function getCoverLetterUsage(): Promise<{
  count: number;
  remaining: number;
}> {
  const ctx = await authed();
  if (!ctx) return { count: 0, remaining: COVER_LETTER_DAILY_MESSAGE_LIMIT };

  const { data, error } = await ctx.supabase
    .from("cover_letter_usage")
    .select("message_count, last_message_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw error;

  // The RPC rolls the count over at UTC midnight; mirror that so a stale row
  // from yesterday reads as 0 until the next increment.
  const last = data?.last_message_at as string | null | undefined;
  const count =
    data && last && utcDay(last) === utcDay(new Date())
      ? (data.message_count as number)
      : 0;
  return {
    count,
    remaining: Math.max(0, COVER_LETTER_DAILY_MESSAGE_LIMIT - count),
  };
}

/* ================================================================== *
 * Job-posting target (tailoring). Reuses the feature-neutral endpoint.
 * ================================================================== */

/**
 * Fetch + extract a job posting server-side (URL) or normalize pasted text.
 * Reuses /api/resume/job-posting (SSRF-guarded, size-capped, no IP leak). Throws
 * CoverLetterLimitError when the daily budget is gone, or JobPostingError(code)
 * with a specific reason otherwise.
 */
export async function fetchJobPosting(
  input: { url: string } | { text: string },
): Promise<ResumeJobPosting> {
  const res = await fetch("/api/resume/job-posting", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });

  if (!res.ok) {
    let code = "generic";
    try {
      const errBody = (await res.json()) as { code?: string };
      if (errBody?.code) code = errBody.code;
    } catch {
      // keep the generic code
    }
    if (code === "daily_limit_reached") throw new CoverLetterLimitError();
    throw new JobPostingError(code);
  }

  const data = (await res.json()) as {
    url?: string;
    title?: string;
    company?: string;
    location?: string;
    text?: string;
  };
  return {
    url: data.url ?? "",
    title: data.title ?? "",
    company: data.company ?? "",
    location: data.location ?? "",
    text: data.text ?? "",
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Attach (or, with null, clear) the target job posting on a draft. Stored inside
 * the draft's `cover_letter` JSONB (no schema change); saveDraftCoverLetter
 * normalizes and preserves it. Leaves the transcript untouched.
 */
export async function setDraftJobPosting(
  id: string,
  jobPosting: ResumeJobPosting | null,
): Promise<CoverLetterDraft> {
  const current = await getDraft(id);
  if (!current) throw new Error("Cover letter not found");
  const nextLetter: CoverLetterData = { ...current.coverLetter };
  if (jobPosting) nextLetter.jobPosting = jobPosting;
  else delete nextLetter.jobPosting;
  return saveDraftCoverLetter(id, nextLetter, current.title);
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

/* ================================================================== *
 * localStorage fallback (env-not-configured / local dev without Supabase).
 * ================================================================== */

const DRAFTS_KEY = "unify_cover_letters_v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readLocalDrafts(): CoverLetterDraft[] {
  if (!hasStorage()) return [];
  try {
    const raw = window.localStorage.getItem(DRAFTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as CoverLetterDraft[]) : [];
  } catch {
    return [];
  }
}

function writeLocalDrafts(drafts: CoverLetterDraft[]): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

async function localListDrafts(): Promise<CoverLetterDraftSummary[]> {
  return readLocalDrafts()
    .slice()
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((d) => ({
      id: d.id,
      title: d.title,
      updatedAt: d.updatedAt,
      complete: d.complete,
    }));
}

async function localGetDraft(id: string): Promise<CoverLetterDraft | null> {
  return readLocalDrafts().find((d) => d.id === id) ?? null;
}

async function localSaveDraft(
  draft: CoverLetterDraft,
): Promise<CoverLetterDraft> {
  const stamped = { ...draft, updatedAt: new Date().toISOString() };
  const drafts = readLocalDrafts();
  const idx = drafts.findIndex((d) => d.id === stamped.id);
  if (idx === -1) drafts.push(stamped);
  else drafts[idx] = stamped;
  writeLocalDrafts(drafts);
  return stamped;
}

async function localDeleteDraft(id: string): Promise<void> {
  writeLocalDrafts(readLocalDrafts().filter((d) => d.id !== id));
}

async function localSaveDraftCoverLetter(
  id: string,
  nextLetter: CoverLetterData,
  title: string,
): Promise<CoverLetterDraft> {
  const drafts = readLocalDrafts();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) throw new Error("Cover letter not found");
  const finalDraft: CoverLetterDraft = {
    ...drafts[idx],
    coverLetter: normalizeCoverLetterData(nextLetter),
    title,
    updatedAt: new Date().toISOString(),
  };
  drafts[idx] = finalDraft;
  writeLocalDrafts(drafts);
  return finalDraft;
}

async function localRenameDraft(
  id: string,
  title: string,
): Promise<CoverLetterDraft> {
  const drafts = readLocalDrafts();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) throw new Error("Cover letter not found");
  const finalDraft: CoverLetterDraft = {
    ...drafts[idx],
    title,
    updatedAt: new Date().toISOString(),
  };
  drafts[idx] = finalDraft;
  writeLocalDrafts(drafts);
  return finalDraft;
}

async function localDuplicateDraft(
  id: string,
  title: string,
): Promise<CoverLetterDraft> {
  const drafts = readLocalDrafts();
  const source = drafts.find((d) => d.id === id);
  if (!source) throw new Error("Cover letter not found");
  const now = new Date().toISOString();
  const clone: CoverLetterDraft = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    coverLetter: structuredClone(source.coverLetter),
    messages: source.messages.map((m) => ({ ...m, id: crypto.randomUUID() })),
    complete: false,
  };
  drafts.push(clone);
  writeLocalDrafts(drafts);
  return clone;
}

/* ================================================================== *
 * The one AI call: a cover-letter turn (proxied to cover-letter-chat).
 * ================================================================== */

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
