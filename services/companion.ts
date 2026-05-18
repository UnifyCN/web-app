import {
  conversations,
  type ConversationThread,
} from "@/lib/mock/conversations";

/**
 * Companion (AI chat) data access.
 * TODO: replace with real data — query Supabase (`conversations`, `messages`,
 * `chatbot_usage`) and call the `rag-query` edge function.
 */

export async function getConversations(): Promise<ConversationThread[]> {
  return conversations;
}

export async function getConversation(
  id: string,
): Promise<ConversationThread | undefined> {
  return conversations.find((conversation) => conversation.id === id);
}

export async function sendMessage(
  conversationId: string,
  text: string,
): Promise<void> {
  // TODO: replace with real data — insert into `messages`, then call
  // `rag-query` for the assistant reply.
  void conversationId;
  void text;
}

export async function getChatbotUsage(): Promise<{ remaining: number }> {
  return { remaining: 3 };
}
