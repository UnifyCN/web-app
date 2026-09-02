/**
 * AI Resume Builder data layer.
 *
 * Drafts + the daily message quota live on the shared Supabase DB
 * (`resume_drafts` own-row RLS, `resume_usage` via the resume-chat edge fn),
 * following the Community wiring pattern: `isSupabaseConfigured()` +
 * `getAuthUserId()` guards, snake_case row mappers, and a localStorage
 * fallback for the env-not-configured / local-dev case. React Query is the
 * optimistic/in-memory cache — no separate localStorage cache layer.
 *
 * The one AI call is generateResumeTurn → POST /api/resume, which proxies the
 * shared `resume-chat` edge function (auth + quota + generation).
 */

import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
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
  ResumeJobPosting,
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

/**
 * Raised when fetching/extracting a job posting fails. `code` mirrors the route's
 * error contract (`invalid_url` | `blocked_url` | `fetch_failed` | `too_large` |
 * `extraction_failed` | `generic`) so the UI can show a specific, localized
 * message and steer the user to the paste-text fallback.
 */
export class JobPostingError extends Error {
  code: string;
  constructor(code: string) {
    super(`Job posting fetch failed: ${code}`);
    this.name = "JobPostingError";
    this.code = code;
  }
}

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

interface ResumeDraftRow {
  id: string;
  title: string;
  resume: ResumeData;
  messages: ResumeChatMessage[] | null;
  complete: boolean;
  created_at: string;
  updated_at: string;
}

function rowToDraft(row: ResumeDraftRow): ResumeDraft {
  return {
    id: row.id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    resume: normalizeResumeData(row.resume),
    messages: Array.isArray(row.messages) ? row.messages : [],
    complete: row.complete,
  };
}

const DRAFT_COLS =
  "id, title, resume, messages, complete, created_at, updated_at";

/* ================================================================== *
 * Drafts.
 * ================================================================== */

/** Newest-first list of lightweight draft rows for the sidebar. */
export async function listDrafts(): Promise<ResumeDraftSummary[]> {
  const ctx = await authed();
  if (!ctx) return localListDrafts();

  const { data, error } = await ctx.supabase
    .from("resume_drafts")
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

export async function getDraft(id: string): Promise<ResumeDraft | null> {
  const ctx = await authed();
  if (!ctx) return localGetDraft(id);

  const { data, error } = await ctx.supabase
    .from("resume_drafts")
    .select(DRAFT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToDraft(data as unknown as ResumeDraftRow) : null;
}

/** Persist a full draft (create or replace), stamping updatedAt. */
export async function saveDraft(draft: ResumeDraft): Promise<ResumeDraft> {
  const ctx = await authed();
  if (!ctx) return localSaveDraft(draft);

  const updatedAt = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("resume_drafts")
    .upsert(
      {
        id: draft.id,
        user_id: ctx.userId,
        title: draft.title,
        resume: normalizeResumeData(draft.resume),
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
  return rowToDraft(data as unknown as ResumeDraftRow);
}

export async function deleteDraft(id: string): Promise<void> {
  const ctx = await authed();
  if (!ctx) return localDeleteDraft(id);

  const { error } = await ctx.supabase
    .from("resume_drafts")
    .delete()
    .eq("id", id);
  if (error) throw error;
}

/**
 * Persist only the resume body + (already-derived) title of an existing draft,
 * leaving the chat transcript + other fields untouched. Callers
 * (useUpdateResumeData) serialize these so the final commit wins.
 */
export async function saveDraftResume(
  id: string,
  nextResume: ResumeData,
  title: string,
): Promise<ResumeDraft> {
  const ctx = await authed();
  if (!ctx) return localSaveDraftResume(id, nextResume, title);

  const { data, error } = await ctx.supabase
    .from("resume_drafts")
    .update({
      resume: normalizeResumeData(nextResume),
      title,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select(DRAFT_COLS)
    .single();
  if (error) throw error;
  return rowToDraft(data as unknown as ResumeDraftRow);
}

/** Rename a draft (title only), leaving the resume body + transcript untouched. */
export async function renameDraft(
  id: string,
  title: string,
): Promise<ResumeDraft> {
  const ctx = await authed();
  if (!ctx) return localRenameDraft(id, title);

  const { data, error } = await ctx.supabase
    .from("resume_drafts")
    .update({ title, updated_at: new Date().toISOString() })
    .eq("id", id)
    .select(DRAFT_COLS)
    .single();
  if (error) throw error;
  return rowToDraft(data as unknown as ResumeDraftRow);
}

/**
 * Duplicate a draft into a brand-new, fully independent row: a fresh id, a deep
 * copy of the resume + transcript (regenerated message ids), and the given title
 * (the caller composes the localized "Copy of …").
 *
 * Ownership integrity: the read + write run in a SINGLE captured auth context,
 * and the clone's `user_id` is PINNED to the reader (`ctx.userId`) rather than
 * re-derived at write time. Two invariants close the cross-user hole:
 *   1. The source read is RLS-scoped, so a draft the caller doesn't own reads as
 *      null and is never copied.
 *   2. The write is a single `insert` (atomic — no partial row) whose `user_id`
 *      is the reader's. If the session flips between read and write, RLS's
 *      with-check (`user_id = auth.uid()`) rejects it — so a mid-op auth change
 *      fails closed instead of copying one account's resume into another. `insert`
 *      (not upsert) also makes a fresh-id collision error rather than overwrite.
 */
export async function duplicateDraft(
  id: string,
  title: string,
): Promise<ResumeDraft> {
  const ctx = await authed();
  if (!ctx) return localDuplicateDraft(id, title);

  const { data: src, error: readError } = await ctx.supabase
    .from("resume_drafts")
    .select(DRAFT_COLS)
    .eq("id", id)
    .maybeSingle();
  if (readError) throw readError;
  if (!src) throw new Error("Draft not found");
  const source = rowToDraft(src as unknown as ResumeDraftRow);

  const now = new Date().toISOString();
  const { data, error } = await ctx.supabase
    .from("resume_drafts")
    .insert({
      id: crypto.randomUUID(),
      user_id: ctx.userId,
      title,
      resume: normalizeResumeData(source.resume),
      messages: source.messages.map((m) => ({ ...m, id: crypto.randomUUID() })),
      complete: false,
      created_at: now,
      updated_at: now,
    })
    .select(DRAFT_COLS)
    .single();
  if (error) throw error;
  return rowToDraft(data as unknown as ResumeDraftRow);
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

/* ================================================================== *
 * Daily message quota — read the row the edge function writes.
 * ================================================================== */

function utcDay(iso: string | Date): string {
  return new Date(iso).toISOString().slice(0, 10);
}

export async function getResumeUsage(): Promise<{
  count: number;
  remaining: number;
}> {
  const ctx = await authed();
  if (!ctx) return { count: 0, remaining: RESUME_DAILY_MESSAGE_LIMIT };

  const { data, error } = await ctx.supabase
    .from("resume_usage")
    .select("message_count, last_message_at")
    .eq("user_id", ctx.userId)
    .maybeSingle();
  if (error) throw error;

  // The RPC rolls the count over at UTC midnight (current_date); mirror that
  // here so a stale row from yesterday reads as 0 until the next increment.
  const last = data?.last_message_at as string | null | undefined;
  const count =
    data && last && utcDay(last) === utcDay(new Date())
      ? (data.message_count as number)
      : 0;
  return { count, remaining: Math.max(0, RESUME_DAILY_MESSAGE_LIMIT - count) };
}

/* ================================================================== *
 * Job-posting target (tailoring).
 * ================================================================== */

/**
 * Fetch + extract a job posting server-side (from a URL) or normalize pasted
 * text. Proxies /api/resume/job-posting so the fetch is SSRF-guarded, size-capped,
 * and never exposes the user's IP. Throws ResumeLimitError when the daily budget
 * is gone, or JobPostingError(code) with a specific reason otherwise.
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
    if (res.status === 429 || code === "daily_limit_reached") throw new ResumeLimitError();
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
 * the draft's `resume` JSONB (no schema change); saveDraftResume normalizes and
 * preserves it. Leaves the transcript untouched.
 */
export async function setDraftJobPosting(
  id: string,
  jobPosting: ResumeJobPosting | null,
): Promise<ResumeDraft> {
  const current = await getDraft(id);
  if (!current) throw new Error("Draft not found");
  const nextResume: ResumeData = { ...current.resume };
  if (jobPosting) nextResume.jobPosting = jobPosting;
  else delete nextResume.jobPosting;
  return saveDraftResume(id, nextResume, current.title);
}

/* ================================================================== *
 * localStorage fallback (env-not-configured / local dev without Supabase).
 *
 * NB: prototype-era drafts that live only in a browser's localStorage are NOT
 * migrated to the DB — a one-time import was considered and dropped because the
 * legacy drafts carry no owner, so on a shared/public device (common for this
 * app's users) it could expose one person's resume to the next. New users on the
 * persisted version simply start fresh.
 * ================================================================== */

const DRAFTS_KEY = "unify_resume_drafts_v1";

function hasStorage(): boolean {
  return typeof window !== "undefined" && !!window.localStorage;
}

function readLocalDrafts(): ResumeDraft[] {
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

function writeLocalDrafts(drafts: ResumeDraft[]): void {
  if (!hasStorage()) return;
  window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(drafts));
}

async function localListDrafts(): Promise<ResumeDraftSummary[]> {
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

async function localGetDraft(id: string): Promise<ResumeDraft | null> {
  return readLocalDrafts().find((d) => d.id === id) ?? null;
}

async function localSaveDraft(draft: ResumeDraft): Promise<ResumeDraft> {
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

async function localSaveDraftResume(
  id: string,
  nextResume: ResumeData,
  title: string,
): Promise<ResumeDraft> {
  const drafts = readLocalDrafts();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) throw new Error("Draft not found");
  const finalDraft: ResumeDraft = {
    ...drafts[idx],
    resume: normalizeResumeData(nextResume),
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
): Promise<ResumeDraft> {
  const drafts = readLocalDrafts();
  const idx = drafts.findIndex((d) => d.id === id);
  if (idx === -1) throw new Error("Draft not found");
  const finalDraft: ResumeDraft = {
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
): Promise<ResumeDraft> {
  const drafts = readLocalDrafts();
  const source = drafts.find((d) => d.id === id);
  if (!source) throw new Error("Draft not found");
  const now = new Date().toISOString();
  const clone: ResumeDraft = {
    id: crypto.randomUUID(),
    title,
    createdAt: now,
    updatedAt: now,
    resume: structuredClone(source.resume),
    messages: source.messages.map((m) => ({ ...m, id: crypto.randomUUID() })),
    complete: false,
  };
  drafts.push(clone);
  writeLocalDrafts(drafts);
  return clone;
}

/* ================================================================== *
 * The one AI call: a resume turn (proxied to the resume-chat edge fn).
 * ================================================================== */

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
