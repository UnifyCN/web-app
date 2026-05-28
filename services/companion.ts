import type { ChatMessage, ChatSource, ChatbotUsage, Conversation } from "@/types";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import {
  mockConversations,
  mockMessagesByConversation,
} from "@/lib/mock/conversations";

/**
 * Companion (AI chat) data access — conversations, messages, daily usage.
 * Real path queries Supabase (`conversations`, `messages`, `chatbot_usage`).
 * AI generation isn't wired yet — the canned reply lives in the hook layer.
 * Falls back to mock when Supabase isn't configured or the user isn't signed in
 * (mirrors profile/checklist/community).
 */

async function getAuthUserId(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user?.id ?? null;
}

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
    createdAt: row.created_at,
  };
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
      const url = typeof record.url === "string" ? record.url : null;
      if (!title || !url) return null;
      return { title, url } satisfies ChatSource;
    })
    .filter((value): value is ChatSource => value !== null);
  return cleaned.length > 0 ? cleaned : null;
}

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

export async function createConversation(
  firstMessage: string,
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

  const { data, error } = await supabase
    .from("conversations")
    .insert({ user_id: userId, title: fallbackTitle })
    .select("conversation_identifier, title, updated_at")
    .single();
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
      "id, role, content, sources, created_at, conversations!inner(conversation_identifier)",
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
    })
    .select("id, role, content, sources, created_at")
    .single();
  if (error) throw error;

  return rowToMessage(data as MessageRow, input.conversationIdentifier);
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
