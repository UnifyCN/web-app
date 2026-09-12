/**
 * Generic draft data layer shared by the Resume Builder and Cover Letter Generator.
 *
 * Both features persist one JSONB "payload" per draft row (`resume_drafts.resume`
 * / `cover_letters.cover_letter`) plus a daily message quota, and fall back to
 * localStorage when Supabase env isn't configured (local dev). That orchestration
 * — CRUD, quota read, job-posting fetch, and the localStorage mirror — is byte-for-
 * byte identical between the two; only the table/column/prop names, the normalizer,
 * the storage key, the daily limit, the not-found message, and the daily-limit
 * error class differ. `createDraftService(config)` owns the orchestration; each
 * feature supplies those tokens.
 *
 * Kept hand-written per feature (genuinely different, NOT in here): `newDraft`, the
 * AI generate-turn call, and the cover-letter `setDraftResumeLink`.
 *
 * Scoping note: reads carry an explicit `.eq("user_id", …)` predicate as
 * defense-in-depth on top of own-row RLS (added in PR #115); preserved here. The
 * pre-existing RLS-only `deleteDraft` (no explicit predicate) is also preserved
 * as-is — behavior is unchanged by this refactor.
 */

import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { JobPostingError } from "@/lib/drafts/errors";
import type { ResumeJobPosting } from "@/types/resume";

/** Lightweight row shown in a feature's draft list/sidebar. Identical shape for both. */
export interface DraftSummary {
  id: string;
  title: string;
  updatedAt: string;
  complete: boolean;
}

/** Fields of a draft payload the shared layer needs to touch (job-posting tailoring). */
export interface DraftDataBase {
  jobPosting?: ResumeJobPosting;
}

/** Fields every draft record carries (plus a feature-specific payload property). */
export interface DraftRecordBase<TMessage extends { id: string }> {
  id: string;
  title: string;
  createdAt: string;
  updatedAt: string;
  messages: TMessage[];
  complete: boolean;
}

export interface DraftServiceConfig<TData extends DraftDataBase> {
  /** DB table holding the draft rows (e.g. "resume_drafts"). */
  draftsTable: string;
  /** DB table holding the per-user daily usage row (e.g. "resume_usage"). */
  usageTable: string;
  /** Daily message cap used for the usage `remaining` computation. */
  dailyLimit: number;
  /** localStorage key for the env-not-configured fallback. */
  storageKey: string;
  /** Error message thrown when a draft isn't found. */
  notFoundMessage: string;
  /** Error thrown by `fetchJobPosting` on a daily-limit 429. */
  LimitError: new () => Error;
  /** Select column list including the feature's payload column. */
  draftCols: string;
  /** snake_case DB payload column (e.g. "resume" / "cover_letter"). */
  payloadColumn: string;
  /** camelCase draft payload property (e.g. "resume" / "coverLetter"). */
  payloadProp: string;
  /** Normalize the payload on the way in/out of persistence. */
  normalize: (data: TData) => TData;
}

export function createDraftService<
  TData extends DraftDataBase,
  TMessage extends { id: string },
  TDraft extends DraftRecordBase<TMessage>,
  TSummary extends DraftSummary = DraftSummary,
>(config: DraftServiceConfig<TData>) {
  const {
    draftsTable,
    usageTable,
    dailyLimit,
    storageKey,
    notFoundMessage,
    LimitError,
    draftCols,
    payloadColumn,
    payloadProp,
    normalize,
  } = config;

  /* ---- Supabase context — null when unconfigured or signed out (→ fallback). ---- */
  async function authed(): Promise<{
    supabase: ReturnType<typeof createClient>;
    userId: string;
  } | null> {
    if (!isSupabaseConfigured()) return null;
    const userId = await getAuthUserId();
    if (!userId) return null;
    return { supabase: createClient(), userId };
  }

  function utcDay(iso: string | Date): string {
    return new Date(iso).toISOString().slice(0, 10);
  }

  /** Read the payload data off a draft record (draft.resume / draft.coverLetter). */
  function getData(draft: TDraft): TData {
    return (draft as unknown as Record<string, unknown>)[payloadProp] as TData;
  }

  /** Map a DB row → domain draft. The payload column/prop + normalizer are the
   *  only per-feature bits, supplied via config. */
  function rowToDraft(row: Record<string, unknown>): TDraft {
    return {
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
      [payloadProp]: normalize(row[payloadColumn] as TData),
      messages: Array.isArray(row.messages) ? row.messages : [],
      complete: row.complete,
    } as unknown as TDraft;
  }

  /* ================================================================== *
   * Drafts.
   * ================================================================== */

  /** Newest-first list of lightweight draft rows. */
  async function listDrafts(): Promise<TSummary[]> {
    const ctx = await authed();
    if (!ctx) return localListDrafts();

    // Own-row RLS is the real boundary; the explicit user_id predicate is
    // defense-in-depth (PR #115) so the intended scope is legible at the call site.
    const { data, error } = await ctx.supabase
      .from(draftsTable)
      .select("id, title, updated_at, complete")
      .eq("user_id", ctx.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return ((data ?? []) as unknown as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      title: r.title as string,
      updatedAt: r.updated_at as string,
      complete: r.complete as boolean,
    })) as TSummary[];
  }

  async function getDraft(id: string): Promise<TDraft | null> {
    const ctx = await authed();
    if (!ctx) return localGetDraft(id);

    // Defense-in-depth: own-row RLS already scopes this; the explicit user_id
    // predicate keeps the read consistent with listDrafts and legible at the call site.
    const { data, error } = await ctx.supabase
      .from(draftsTable)
      .select(draftCols)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw error;
    return data ? rowToDraft(data as unknown as Record<string, unknown>) : null;
  }

  /** Persist a full draft (create or replace), stamping updatedAt. */
  async function saveDraft(draft: TDraft): Promise<TDraft> {
    const ctx = await authed();
    if (!ctx) return localSaveDraft(draft);

    const updatedAt = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from(draftsTable)
      .upsert(
        {
          id: draft.id,
          user_id: ctx.userId,
          title: draft.title,
          [payloadColumn]: normalize(getData(draft)),
          messages: draft.messages,
          complete: draft.complete,
          created_at: draft.createdAt,
          updated_at: updatedAt,
        },
        { onConflict: "id" },
      )
      .select(draftCols)
      .single();
    if (error) throw error;
    return rowToDraft(data as unknown as Record<string, unknown>);
  }

  async function deleteDraft(id: string): Promise<void> {
    const ctx = await authed();
    if (!ctx) return localDeleteDraft(id);

    const { error } = await ctx.supabase.from(draftsTable).delete().eq("id", id);
    if (error) throw error;
  }

  /**
   * Persist only the payload + (already-derived) title of an existing draft,
   * leaving the chat transcript + other fields untouched. Callers serialize these
   * so the final commit wins.
   */
  async function saveDraftPayload(
    id: string,
    nextData: TData,
    title: string,
  ): Promise<TDraft> {
    const ctx = await authed();
    if (!ctx) return localSaveDraftPayload(id, nextData, title);

    const { data, error } = await ctx.supabase
      .from(draftsTable)
      .update({
        [payloadColumn]: normalize(nextData),
        title,
        updated_at: new Date().toISOString(),
      })
      .eq("id", id)
      .select(draftCols)
      .single();
    if (error) throw error;
    return rowToDraft(data as unknown as Record<string, unknown>);
  }

  /** Rename a draft (title only), leaving the payload + transcript untouched. */
  async function renameDraft(id: string, title: string): Promise<TDraft> {
    const ctx = await authed();
    if (!ctx) return localRenameDraft(id, title);

    const { data, error } = await ctx.supabase
      .from(draftsTable)
      .update({ title, updated_at: new Date().toISOString() })
      .eq("id", id)
      .select(draftCols)
      .single();
    if (error) throw error;
    return rowToDraft(data as unknown as Record<string, unknown>);
  }

  /**
   * Duplicate a draft into a brand-new, fully independent row: a fresh id, a deep
   * copy of the payload + transcript (regenerated message ids), and the given title.
   *
   * Ownership integrity: the read + write run in a SINGLE captured auth context, and
   * the clone's `user_id` is PINNED to the reader. The RLS-scoped read can't return a
   * draft the caller doesn't own, and the single `insert` (with RLS with-check) fails
   * closed on a mid-op auth flip rather than copying one account's draft into another.
   */
  async function duplicateDraft(id: string, title: string): Promise<TDraft> {
    const ctx = await authed();
    if (!ctx) return localDuplicateDraft(id, title);

    const { data: src, error: readError } = await ctx.supabase
      .from(draftsTable)
      .select(draftCols)
      .eq("id", id)
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (readError) throw readError;
    if (!src) throw new Error(notFoundMessage);
    const source = rowToDraft(src as unknown as Record<string, unknown>);

    const now = new Date().toISOString();
    const { data, error } = await ctx.supabase
      .from(draftsTable)
      .insert({
        id: crypto.randomUUID(),
        user_id: ctx.userId,
        title,
        [payloadColumn]: normalize(getData(source)),
        messages: source.messages.map((m) => ({
          ...m,
          id: crypto.randomUUID(),
        })),
        complete: false,
        created_at: now,
        updated_at: now,
      })
      .select(draftCols)
      .single();
    if (error) throw error;
    return rowToDraft(data as unknown as Record<string, unknown>);
  }

  /* ================================================================== *
   * Daily message quota — read the row the edge function writes.
   * ================================================================== */

  async function getUsage(): Promise<{ count: number; remaining: number }> {
    const ctx = await authed();
    if (!ctx) return { count: 0, remaining: dailyLimit };

    const { data, error } = await ctx.supabase
      .from(usageTable)
      .select("message_count, last_message_at")
      .eq("user_id", ctx.userId)
      .maybeSingle();
    if (error) throw error;

    // The RPC rolls the count over at UTC midnight; mirror that so a stale row
    // from yesterday reads as 0 until the next increment.
    const row = data as unknown as Record<string, unknown> | null;
    const last = row?.last_message_at as string | null | undefined;
    const count =
      row && last && utcDay(last) === utcDay(new Date())
        ? (row.message_count as number)
        : 0;
    return { count, remaining: Math.max(0, dailyLimit - count) };
  }

  /* ================================================================== *
   * Job-posting target (tailoring). Feature-neutral endpoint.
   * ================================================================== */

  /**
   * Fetch + extract a job posting server-side (URL) or normalize pasted text.
   * Proxies /api/resume/job-posting (SSRF-guarded, size-capped, no IP leak). Throws
   * the feature's LimitError when the daily budget is gone, or JobPostingError(code)
   * with a specific reason otherwise.
   */
  async function fetchJobPosting(
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
      // Only the daily-cap 429 is a LimitError; a rate-limit 429 (and every other
      // failure) carries its own code so the UI shows the right message.
      if (code === "daily_limit_reached") throw new LimitError();
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
   * the draft's payload JSONB (no schema change); saveDraftPayload normalizes and
   * preserves it. Leaves the transcript untouched.
   */
  async function setDraftJobPosting(
    id: string,
    jobPosting: ResumeJobPosting | null,
  ): Promise<TDraft> {
    const current = await getDraft(id);
    if (!current) throw new Error(notFoundMessage);
    const nextData = { ...getData(current) } as TData;
    if (jobPosting) nextData.jobPosting = jobPosting;
    else delete nextData.jobPosting;
    return saveDraftPayload(id, nextData, current.title);
  }

  /* ================================================================== *
   * localStorage fallback (env-not-configured / local dev without Supabase).
   * ================================================================== */

  function hasStorage(): boolean {
    return typeof window !== "undefined" && !!window.localStorage;
  }

  function readLocalDrafts(): TDraft[] {
    if (!hasStorage()) return [];
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as TDraft[]) : [];
    } catch {
      return [];
    }
  }

  function writeLocalDrafts(drafts: TDraft[]): void {
    if (!hasStorage()) return;
    window.localStorage.setItem(storageKey, JSON.stringify(drafts));
  }

  async function localListDrafts(): Promise<TSummary[]> {
    return readLocalDrafts()
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((d) => ({
        id: d.id,
        title: d.title,
        updatedAt: d.updatedAt,
        complete: d.complete,
      })) as TSummary[];
  }

  async function localGetDraft(id: string): Promise<TDraft | null> {
    return readLocalDrafts().find((d) => d.id === id) ?? null;
  }

  async function localSaveDraft(draft: TDraft): Promise<TDraft> {
    const stamped = { ...draft, updatedAt: new Date().toISOString() } as TDraft;
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

  async function localSaveDraftPayload(
    id: string,
    nextData: TData,
    title: string,
  ): Promise<TDraft> {
    const drafts = readLocalDrafts();
    const idx = drafts.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error(notFoundMessage);
    const finalDraft = {
      ...drafts[idx],
      [payloadProp]: normalize(nextData),
      title,
      updatedAt: new Date().toISOString(),
    } as TDraft;
    drafts[idx] = finalDraft;
    writeLocalDrafts(drafts);
    return finalDraft;
  }

  async function localRenameDraft(id: string, title: string): Promise<TDraft> {
    const drafts = readLocalDrafts();
    const idx = drafts.findIndex((d) => d.id === id);
    if (idx === -1) throw new Error(notFoundMessage);
    const finalDraft = {
      ...drafts[idx],
      title,
      updatedAt: new Date().toISOString(),
    } as TDraft;
    drafts[idx] = finalDraft;
    writeLocalDrafts(drafts);
    return finalDraft;
  }

  async function localDuplicateDraft(
    id: string,
    title: string,
  ): Promise<TDraft> {
    const drafts = readLocalDrafts();
    const source = drafts.find((d) => d.id === id);
    if (!source) throw new Error(notFoundMessage);
    const now = new Date().toISOString();
    const clone = {
      ...source,
      id: crypto.randomUUID(),
      title,
      createdAt: now,
      updatedAt: now,
      [payloadProp]: structuredClone(getData(source)),
      messages: source.messages.map((m) => ({ ...m, id: crypto.randomUUID() })),
      complete: false,
    } as TDraft;
    drafts.push(clone);
    writeLocalDrafts(drafts);
    return clone;
  }

  return {
    listDrafts,
    getDraft,
    saveDraft,
    deleteDraft,
    saveDraftPayload,
    renameDraft,
    duplicateDraft,
    getUsage,
    fetchJobPosting,
    setDraftJobPosting,
  };
}
