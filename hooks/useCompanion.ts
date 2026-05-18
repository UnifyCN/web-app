import { useQuery, useMutation } from "@tanstack/react-query";
import * as companion from "@/services/companion";

/** React Query hooks for Companion (AI chat) data. */

export function useConversations() {
  return useQuery({
    queryKey: ["conversations"],
    queryFn: companion.getConversations,
  });
}

export function useConversation(id: string) {
  return useQuery({
    queryKey: ["conversations", id],
    queryFn: () => companion.getConversation(id),
  });
}

export function useChatbotUsage() {
  return useQuery({
    queryKey: ["chatbot-usage"],
    queryFn: companion.getChatbotUsage,
  });
}

export function useSendMessage() {
  return useMutation({
    mutationFn: ({
      conversationId,
      text,
    }: {
      conversationId: string;
      text: string;
    }) => companion.sendMessage(conversationId, text),
  });
}
