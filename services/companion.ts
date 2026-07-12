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
import {
  mockConversations,
  mockMessagesByConversation,
} from "@/lib/mock/conversations";
import { isInternalSourceUrl } from "@/lib/utils";

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
    createdAt: row.created_at,
  };
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

export async function getConversations(): Promise<Conversation[]> {
  if (!isSupabaseConfigured()) return mockConversations;

  const userId = await getAuthUserId();
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

export async function createConversation(
  firstMessage: string,
  options: CreateConversationOptions = {},
): Promise<Conversation> {
  if (!isSupabaseConfigured()) {
    throw new Error("createConversation: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("createConversation: no auth session");

  const supabase = createClient();
  // Fallback title — first 50 chars of the user's first message. Mobile
  // overwrites this asynchronously via a generate-title edge function; that's
  // deferred until the AI backend lands (see plan / BACKLOG).
  const fallbackTitle = firstMessage.slice(0, 50);

  const baseRow = { user_id: userId, title: fallbackTitle };
  const taggedRow =
    options.source != null
      ? { ...baseRow, source: options.source, lesson_id: options.lessonId ?? null }
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
): Promise<ChatMessage[]> {
  if (!isSupabaseConfigured()) {
    return mockMessagesByConversation[conversationIdentifier] ?? [];
  }
  const userId = await getAuthUserId();
  if (!userId) {
    return mockMessagesByConversation[conversationIdentifier] ?? [];
  }

  const supabase = createClient();
  const { data, error } = await supabase
    .from("messages")
    .select(
      "id, role, content, sources, suggested_next_steps, created_at, conversations!inner(conversation_identifier)",
    )
    .eq("conversations.conversation_identifier", conversationIdentifier)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return (data as MessageRow[]).map((row) =>
    rowToMessage(row, conversationIdentifier),
  );
}

export interface SaveMessageInput {
  conversationIdentifier: string;
  role: "user" | "assistant";
  content: string;
  sources?: ChatSource[] | null;
  suggestedNextSteps?: string[] | null;
}

export async function saveMessage(input: SaveMessageInput): Promise<ChatMessage> {
  if (!isSupabaseConfigured()) {
    throw new Error("saveMessage: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("saveMessage: no auth session");

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

  const { data, error } = await supabase
    .from("messages")
    .insert({
      conversation_id: (conv as { id: number }).id,
      role: input.role,
      content: input.content,
      sources: input.sources ?? null,
      suggested_next_steps: input.suggestedNextSteps ?? null,
    })
    .select("id, role, content, sources, suggested_next_steps, created_at")
    .single();
  if (error) throw error;

  return rowToMessage(data as MessageRow, input.conversationIdentifier);
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
  disclaimer?: string;
  suggestedNextSteps?: string[];
  lastVerified?: string;
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
}

export interface GeneratedReply {
  answer: string;
  sources: ChatSource[] | null;
  suggestedNextSteps: string[] | null;
}

/**
 * Calls the `rag-query` edge function and returns the assistant answer +
 * normalized citations. The browser Supabase client attaches the user's JWT
 * automatically. A 429 surfaces as {@link ChatLimitError}; the IRCC disclaimer
 * the function returns is appended to the answer (the web UI has no separate
 * disclaimer slot like mobile).
 */
export async function generateReply(
  input: GenerateReplyInput,
): Promise<GeneratedReply> {
  if (!isSupabaseConfigured()) {
    return { answer: MOCK_REPLY, sources: null, suggestedNextSteps: null };
  }

  // POST to the same-origin /api/companion proxy, which forwards to the
  // rag-query-web edge function server-side with the user's JWT (keeping the
  // call same-origin and the JWT in an httpOnly cookie). A 429 surfaces as
  // ChatLimitError; the IRCC disclaimer the function returns is appended to the
  // answer (the web UI has no separate disclaimer slot like mobile).
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

  const answer = body.disclaimer
    ? `${body.answer}\n\n${body.disclaimer}`
    : body.answer;

  return {
    answer,
    sources: normalizeSources(body.sources),
    suggestedNextSteps: normalizeSuggestions(body.suggestedNextSteps),
  };
}

export async function deleteConversation(
  conversationIdentifier: string,
): Promise<void> {
  if (!isSupabaseConfigured()) {
    throw new Error("deleteConversation: Supabase not configured");
  }
  const userId = await getAuthUserId();
  if (!userId) throw new Error("deleteConversation: no auth session");

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
