import { ownAccountWork } from "@/lib/accountSession";

/** Conversation lists and threads are keyed by account (#361): a mounted
 *  sidebar or thread never reads another account's entry. Prefix
 *  invalidation of a root still reaches every account's entry. */
export const CONVERSATIONS_ROOT = "conversations" as const;
export const MESSAGES_ROOT = "conversation-messages" as const;

export function conversationsKey(accountId: string | null | undefined) {
  return [CONVERSATIONS_ROOT, accountId ?? null] as const;
}

/** A conversation's thread. `accountId` defaults to the current owner. */
export function messagesKey(
  conversationIdentifier: string,
  accountId: string | null | undefined = ownAccountWork().accountId,
) {
  return [MESSAGES_ROOT, accountId ?? null, conversationIdentifier] as const;
}
