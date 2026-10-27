import { parseSuggestedSteps } from "@/lib/companionActions/contract";
import type {
  ChatMessage,
  ChatSource,
  ChatbotUsage,
  Conversation,
  LessonContext,
} from "@/types";
import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { assertOwned, type AccountOwner } from "@/lib/accountSession";
import {
  mockConversations,
  mockMessagesByConversation,
} from "@/lib/mock/conversations";
import { isInternalSourceUrl } from "@/lib/utils";
import {
  parseCompanionTopic,
  type CompanionTopic,
} from "@/lib/companionAnalytics";
import {
  parseCompanionContext,
  type CompanionContext,
} from "@/lib/companionContext";

/**
 * Companion (AI chat) data access — conversations, messages, daily usage, and
 * AI reply generation. Real path queries Supabase (`conversations`, `messages`,
 * `chatbot_usage`) and invokes the `rag-query` edge function for replies.
 * Falls back to mock when Supabase isn't configured or the user isn't signed in
 * (mirrors profile/checklist/community).
 */

/* ---- Row shapes -------------------------------------------------------- */

interface ConversationRow {
  conversation_identifier: string;
  title: string | null;
  updated_at: string;
}

interface MessageRow {
  id: number;
  role: "user" | "assistant";
  content: string;
  sources: unknown;
  suggested_next_steps: unknown;
  /** Absent until the additive companion_context migration is applied. */
  companion_context?: unknown;
  created_at: string;
}

interface ChatbotUsageRow {
  message_count: number;
  last_message_at: string | null;
}

function rowToConversation(row: ConversationRow): Conversation {
  return {
    id: row.conversation_identifier,
    title: row.title,
    updatedAt: row.updated_at,
  };
}

function rowToMessage(row: MessageRow, conversationId: string): ChatMessage {
  return {
    id: row.id,
    conversationId,
    role: row.role,
    content: row.content,
    sources: normalizeSources(row.sources),
    suggestedNextSteps: normalizeSuggestions(row.suggested_next_steps),
    companionContext: parseCompanionContext(row.companion_context),
    createdAt: row.created_at,
  };
}

/**
 * True when PostgREST rejects `messages.companion_context` because the
 * additive migration is not applied yet (42703 / PGRST204 / schema cache).
 * Callers then retry without the column, so chat keeps working.
 */
function isMissingContextColumn(error: unknown): boolean {
  const e = error as { code?: string; message?: string } | null;
  if (!e) return false;
  return (
    e.code === "42703" ||
    e.code === "PGRST204" ||
    /companion_context/i.test(e.message ?? "")
  );
}

/** Coerce raw suggestions into a clean string[] (non-empty, trimmed) or null. */
function normalizeSuggestions(raw: unknown): string[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .filter((entry): entry is string => typeof entry === "string")
    .map((entry) => entry.trim())
    .filter((entry) => entry.length > 0);
  return cleaned.length > 0 ? cleaned : null;
}

function normalizeSources(raw: unknown): ChatSource[] | null {
  if (!Array.isArray(raw)) return null;
  const cleaned = raw
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const title =
        typeof record.title === "string"
          ? record.title
          : typeof record.document_title === "string"
            ? record.document_title
            : null;
      const url =
        typeof record.url === "string" && /^https?:\/\//i.test(record.url)
          ? record.url
          : null;
      if (!title || !url) return null;
      return { title, url } satisfies ChatSource;
    })
    .filter((value): value is ChatSource => value !== null)
    // Drop internal KB files (S3) — only public sources are shown as citations.
    .filter((value) => !isInternalSourceUrl(value.url));
  return cleaned.length > 0 ? cleaned : null;
}

/**
 * Free-tier daily message cap shown next to the chat input. Must match the limit
 * the deployed `rag-query` edge function enforces via
 * `check_and_increment_chatbot_usage` — the shared-DB function allows 6/day. The
 * server check is authoritative; this constant only mirrors it for UX gating.
 * Single source of truth for both the Companion tab and the In-Lesson chat.
 */
export const FREE_TIER_DAILY_LIMIT = 6;

/* ---- Conversations ---------------------------------------------------- */

/** The conversations of `owner`, read only while it is the signed-in account
 *  (mobile-app#361). */
export async function getConversations(
  owner: AccountOwner,
): Promise<Conversation[]> {
  if (!isSupabaseConfigured()) return mockConversations;

  const userId = await getAuthUserId();
  assertOwned(owner, userId);
  if (!userId) return mockConversations;

  const supabase = createClient();
  const { data, error } = await supabase
    .from("conversations")
    .select("conversation_identifier, title, updated_at")
    .order("updated_at", { ascending: false });
  if (error) throw error;

  return (data as ConversationRow[]).map(rowToConversation);
}

export interface CreateConversationOptions {
  /** Where the conversation started — "in-lesson" for In-Lesson Help chats;
   *  omitted for regular Companion-tab conversations. */
  source?: "in-lesson";
  /** Sanity lesson _id the chat was opened from (with source "in-lesson"). */
  lessonId?: string;
}

/** Each request of the creation is made only while `owner` is signed in. */
export async function createConversation(
  firstMessage: string,
  options: CreateConversationOptions,
  owner: AccountOwner,
): Promise<Conversation> {
  if (!isSupabaseConfigured()) {
    throw new Error("createConversation: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("createConversation: no auth session");
  assertOwned(owner, userId);

  const supabase = createClient();
  // Fallback title — first 50 chars of the user's first message. Mobile
  // overwrites this asynchronously via a generate-title edge function; that's
  // deferred until the AI backend lands (see plan / BACKLOG).
  const fallbackTitle = firstMessage.slice(0, 50);

  const baseRow = { user_id: userId, title: fallbackTitle };
  const taggedRow =
    options.source != null
      ? {
          ...baseRow,
          source: options.source,
          lesson_id: options.lessonId ?? null,
        }
      : baseRow;

  let { data, error } = await supabase
    .from("conversations")
    .insert(taggedRow)
    .select("conversation_identifier, title, updated_at")
    .single();

  // The source/lesson_id columns land via a shared-DB migration that may not
  // be applied yet (dashboard apply, needs mobile-team ack). Until then the
  // tagged insert fails with "column not found" (42703 / PostgREST schema-cache
  // PGRST204) — retry untagged so the chat still works; PostHog keeps the tag.
  if (
    error &&
    taggedRow !== baseRow &&
    ((error as { code?: string }).code === "42703" ||
      (error as { code?: string }).code === "PGRST204" ||
      /column|schema cache/i.test(error.message ?? ""))
  ) {
    console.warn(
      "[companion] conversations.source/lesson_id columns not present — " +
        "falling back to an untagged insert (apply the source-tag migration).",
      error,
    );
    assertOwned(owner);
    ({ data, error } = await supabase
      .from("conversations")
      .insert(baseRow)
      .select("conversation_identifier, title, updated_at")
      .single());
  }
  if (error) throw error;

  return rowToConversation(data as ConversationRow);
}

/* ---- Messages --------------------------------------------------------- */

export async function getMessages(
  conversationIdentifier: string,
  /** The account whose thread this is (mobile-app#361). */
  owner: AccountOwner,
): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured()) {
    return mockMessagesByConversation[conversationIdentifier] ?? [];
  }
  const userId = await getAuthUserId();
  assertOwned(owner, userId);
  if (!userId) {
    return mockMessagesByConversation[conversationIdentifier] ?? [];
  }

  const supabase = createClient();
  const columns =
    "id, role, content, sources, suggested_next_steps, created_at, conversations!inner(conversation_identifier)";
  const query = (select: string) =>
    supabase
      .from("messages")
      .select(select)
      .eq("conversations.conversation_identifier", conversationIdentifier)
      .order("created_at", { ascending: true });
  let { data, error } = await query(`${columns}, companion_context`);
  if (error && isMissingContextColumn(error)) {
    assertOwned(owner);
    ({ data, error } = await query(columns));
  }
  if (error) throw error;

  return (data as unknown as MessageRow[]).map((row) =>
    rowToMessage(row, conversationIdentifier),
  );
}

export interface SaveMessageInput {
  conversationIdentifier: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[] | null;
  suggestedNextSteps?: string[] | null;
  /** The answer's context (ticket #362); saved when the column exists. */
  companionContext?: unknown;
  /** The account that sends the message (mobile-app#361). Each request of the
   *  save is made only while it is the signed-in account. */
  owner: AccountOwner;
}

export async function saveMessage(
  input: SaveMessageInput,
): Promise<ChatMessage> {
  if (!isSupabaseConfigured()) {
    throw new Error("saveMessage: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("saveMessage: no auth session");
  assertOwned(input.owner, userId);

  const supabase = createClient();

  // Look up the bigint primary key the messages table FKs to. RLS scopes this
  // to the caller's own conversations.
  const { data: conv, error: convError } = await supabase
    .from("conversations")
    .select("id")
    .eq("conversation_identifier", input.conversationIdentifier)
    .maybeSingle();
  if (convError) throw convError;
  if (!conv) {
    throw new Error(
      `saveMessage: conversation ${input.conversationIdentifier} not found`,
    );
  }

  assertOwned(input.owner);
  const row = {
    conversation_id: (conv as { id: number }).id,
    role: input.role,
    content: input.content,
    sources: input.sources ?? null,
    suggested_next_steps: input.suggestedNextSteps ?? null,
  };
  const insert = (values: Record<string, unknown>, select: string) =>
    supabase.from("messages").insert(values).select(select).single();
  const columns =
    "id, role, content, sources, suggested_next_steps, created_at";
  let { data, error } =
    input.companionContext != null
      ? await insert(
          { ...row, companion_context: input.companionContext },
          `${columns}, companion_context`,
        )
      : await insert(row, columns);
  if (
    error &&
    input.companionContext != null &&
    isMissingContextColumn(error)
  ) {
    // Column not migrated yet: save the answer without its context.
    assertOwned(input.owner);
    ({ data, error } = await insert(row, columns));
  }
  if (error) throw error;

  return rowToMessage(
    data as unknown as MessageRow,
    input.conversationIdentifier,
  );
}

/* ---- AI reply generation (rag-query edge function) -------------------- */

/** Thrown when the daily free-tier message limit is hit (rag-query 429). */
export class ChatLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ChatLimitError";
  }
}

/** Shape returned by the rag-query edge function (subset we consume). */
interface RagQueryResponse {
  answer: string;
  sources?: { document_id: number; document_title: string; url: string }[];
  queryType?: string;
  /** Analytics topic label; absent from a rag-query that predates it. */
  topic?: string;
  disclaimer?: string;
  suggestedNextSteps?: string[];
  lastVerified?: string;
  /** Companion context (ticket #362); absent from an older rag-query. */
  context?: unknown;
  /** One suggested task for review (ticket #363); absent when none. */
  actionProposal?: unknown;
  tokenUsage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
  estimatedCostUsd?: number;
}

// Local-dev / env-not-configured fallback (mirrors the other services). The
// real reply comes from the rag-query edge function.
const MOCK_REPLY =
  "Thanks for asking! Here's a general overview to point you in the right " +
  "direction. Details can vary by province and change over time, so for " +
  "anything official — applications, deadlines, or eligibility — confirm with " +
  "the relevant government website or a settlement counsellor.";

export interface GenerateReplyInput {
  conversationIdentifier: string;
  prompt: string;
  /** Prior turns (oldest→newest), already trimmed to the last ~10 by the caller. */
  history: { role: "user" | "assistant"; message: string }[];
  /** In-Lesson Help — lesson-reader context; rag-query scopes its answer to it. */
  lessonContext?: LessonContext;
  /** Web i18n — UI language code ("vi"/"es"/"hi"); rag-query replies in it.
   *  Omitted for English (the default) so backward compatibility is preserved. */
  responseLanguage?: string;
  /** The account that asks (mobile-app#361): no request is made for another. */
  owner: AccountOwner;
}

/**
 * Which fixed IRCC disclaimer rag-query chose for this answer: `"legal"` (the
 * standard "general information, not legal advice" notice when the KB had good
 * hits) or `"legalNoKb"` (the standard notice preceded by the "may not be in
 * Unify's internal resources" notice when it didn't). `null` when the function
 * returned no disclaimer. The caller resolves this to a localized string via the
 * `companion.legalDisclaimer` / `companion.noKbDisclaimer` translation keys — the
 * service stays free of React/i18n.
 */
export type DisclaimerKind = "legal" | "legalNoKb" | null;

export interface GeneratedReply {
  answer: string;
  sources: ChatSource[] | null;
  suggestedNextSteps: string[] | null;
  disclaimerKind: DisclaimerKind;
  /** What the answer read and checked; null from an older rag-query. Never
   *  passed to analytics. */
  context: CompanionContext | null;
  /** The server's version-1 context object as received, for saving with the
   *  answer (the saved row is parsed again on read). Null when absent. */
  contextRecord: Record<string, unknown> | null;
  /** A task (#363) or steps for one Checklist task (#366) the answer suggests for
   *  the user to review. A suggestion only: the action service prepares the
   *  reviewable draft; nothing is saved here. */
  actionProposal:
    | { type: "task.create_custom"; title: string }
    | { type: "step.create"; taskRef: string; titles: string[] }
    | null;
  /* Analytics only (companion_response_received); null when absent. */
  queryType: string | null;
  topic: CompanionTopic | null;
  tokenUsage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  } | null;
  estimatedCostUsd: number | null;
}

/** The raw context object when it is version 1 and small enough to save. */
function savableContext(raw: unknown): Record<string, unknown> | null {
  if (!parseCompanionContext(raw)) return null;
  return JSON.stringify(raw).length <= 30_000
    ? (raw as Record<string, unknown>)
    : null;
}

/** Allowlisted fields only; anything else in the suggestion is dropped. */
function parseActionProposal(raw: unknown): GeneratedReply["actionProposal"] {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.type === "step.create") {
    const steps = parseSuggestedSteps(raw);
    return steps
      ? { type: "step.create", taskRef: steps.taskRef, titles: steps.titles }
      : null;
  }
  if (r.type !== "task.create_custom" || r.version !== 1) return null;
  if (typeof r.title !== "string") return null;
  const title = r.title.trim();
  return title && title.length <= 200
    ? { type: "task.create_custom", title }
    : null;
}

function finiteNumber(raw: unknown): number | null {
  return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
}

function normalizeTokenUsage(
  raw: RagQueryResponse["tokenUsage"],
): GeneratedReply["tokenUsage"] {
  if (!raw || typeof raw !== "object") return null;
  const promptTokens = finiteNumber(raw.prompt_tokens);
  const completionTokens = finiteNumber(raw.completion_tokens);
  const totalTokens = finiteNumber(raw.total_tokens);
  if (
    promptTokens === null ||
    completionTokens === null ||
    totalTokens === null
  ) {
    return null;
  }
  return { promptTokens, completionTokens, totalTokens };
}

/**
 * rag-query returns its IRCC disclaimer as a fixed *English* string in a separate
 * `disclaimer` field, so it isn't localized even when the answer is (the
 * `responseLanguage` directive only steers the LLM). We classify which variant it
 * is here and let the hook render a translated equivalent instead. The
 * "internal resources" marker is a stable substring of the no-KB notice.
 */
function classifyDisclaimer(disclaimer: unknown): DisclaimerKind {
  if (typeof disclaimer !== "string" || disclaimer.trim() === "") return null;
  return disclaimer.includes("internal resources") ? "legalNoKb" : "legal";
}

/**
 * Calls the `rag-query` edge function and returns the assistant answer +
 * normalized citations. The browser Supabase client attaches the user's JWT
 * automatically. A 429 surfaces as {@link ChatLimitError}. The IRCC disclaimer is
 * NOT appended here — {@link classifyDisclaimer} reports which variant applies so
 * the caller can render a localized version (the web UI has no separate disclaimer
 * slot like mobile, so the hook appends the translated text to the answer).
 */
export async function generateReply(
  input: GenerateReplyInput,
): Promise<GeneratedReply> {
  if (!isSupabaseConfigured()) {
    return {
      answer: MOCK_REPLY,
      sources: null,
      suggestedNextSteps: null,
      disclaimerKind: null,
      context: null,
      contextRecord: null,
      actionProposal: null,
      queryType: null,
      topic: null,
      tokenUsage: null,
      estimatedCostUsd: null,
    };
  }

  // POST to the same-origin /api/companion proxy, which forwards to the
  // rag-query-web edge function server-side with the user's JWT (keeping the
  // call same-origin and the JWT in an httpOnly cookie). A 429 surfaces as
  // ChatLimitError. The IRCC disclaimer is classified (not appended) here so the
  // caller can render a localized version (the web UI has no separate disclaimer
  // slot like mobile).
  // The proxy sends the session in the cookie: ask only while that session is
  // the account that asks.
  assertOwned(input.owner, await getAuthUserId());
  const res = await fetch("/api/companion", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      prompt: input.prompt,
      conversationIdentifier: input.conversationIdentifier,
      messages: input.history,
      ...(input.lessonContext ? { lessonContext: input.lessonContext } : {}),
      ...(input.responseLanguage
        ? { responseLanguage: input.responseLanguage }
        : {}),
    }),
  });

  let body: (RagQueryResponse & { error?: string }) | null = null;
  try {
    body = (await res.json()) as RagQueryResponse & { error?: string };
  } catch {
    // non-JSON body — handled by the !res.ok / missing-answer branches below
  }

  if (!res.ok) {
    if (res.status === 429) {
      throw new ChatLimitError(
        body?.error ?? "Daily message limit reached. Try again tomorrow.",
      );
    }
    throw new Error(body?.error ?? `rag-query failed (${res.status})`);
  }

  if (!body || typeof body.answer !== "string") {
    throw new Error("rag-query returned no answer");
  }

  return {
    answer: body.answer,
    sources: normalizeSources(body.sources),
    suggestedNextSteps: normalizeSuggestions(body.suggestedNextSteps),
    disclaimerKind: classifyDisclaimer(body.disclaimer),
    context: parseCompanionContext(body.context),
    contextRecord: savableContext(body.context),
    actionProposal: parseActionProposal(body.actionProposal),
    queryType: typeof body.queryType === "string" ? body.queryType : null,
    topic: parseCompanionTopic(body.topic),
    tokenUsage: normalizeTokenUsage(body.tokenUsage),
    estimatedCostUsd: finiteNumber(body.estimatedCostUsd),
  };
}

export async function deleteConversation(
  conversationIdentifier: string,
  owner: AccountOwner,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("deleteConversation: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("deleteConversation: no auth session");
  assertOwned(owner, userId);

  const supabase = createClient();
  // RLS scopes the delete to the user's own rows and the messages.cascade
  // on delete handles cleanup automatically. Chain .select() so the call
  // returns the affected rows — a zero-length result means RLS hid the row
  // or it was already deleted (e.g. from another device); surface that as a
  // rejection so the optimistic remove rolls back instead of silently
  // succeeding.
  const { data, error } = await supabase
    .from("conversations")
    .delete()
    .eq("conversation_identifier", conversationIdentifier)
    .select("conversation_identifier");
  if (error) throw error;
  if (!data || data.length === 0) {
    throw new Error(
      `deleteConversation: conversation ${conversationIdentifier} not found`,
    );
  }
}

/* ---- Usage ------------------------------------------------------------ */

export async function getChatbotUsage(): Promise<ChatbotUsage> {
  if (!isSupabaseConfigured()) {
    return { messageCount: 0, lastMessageAt: null };
  }
  const userId = await getAuthUserId();
  if (!userId) return { messageCount: 0, lastMessageAt: null };

  const supabase = createClient();
  const { data, error } = await supabase
    .from("chatbot_usage")
    .select("message_count, last_message_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return { messageCount: 0, lastMessageAt: null };

  const row = data as ChatbotUsageRow;
  // Display-only "different day → 0" reset to match mobile. Server-side
  // enforcement is deferred to a later phase.
  const isSameDay =
    row.last_message_at !== null &&
    row.last_message_at.slice(0, 10) === new Date().toISOString().slice(0, 10);

  return {
    messageCount: isSameDay ? row.message_count : 0,
    lastMessageAt: row.last_message_at,
  };
}
