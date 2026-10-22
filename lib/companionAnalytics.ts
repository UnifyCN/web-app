import type { ChatMessage } from "@/types";
import { TOPICS, type Topic } from "@/supabase/functions/_shared/topics";

/**
 * Companion analytics vocabulary shared with mobile (spec
 * UnifyCN/mobile-app#314). Metadata only: the question text never goes into a
 * client event.
 */

/** The topic labels rag-query puts on an answer. The list itself lives in
 *  supabase/functions/_shared/topics.ts, the one file both rag-query and the
 *  web app import. */
export const COMPANION_TOPICS = TOPICS;

export type CompanionTopic = Topic;

/** How the user produced a Companion message. */
export type CompanionInputSource = "typed" | "starter_prompt" | "suggestion";

/**
 * rag-query's `topic`, or null when the deployed function sends none (an older
 * version) or sends a value off the list. Checking the list also guarantees no
 * free text can ride into an analytics event.
 */
export function parseCompanionTopic(raw: unknown): CompanionTopic | null {
  return typeof raw === "string" &&
    (COMPANION_TOPICS as readonly string[]).includes(raw)
    ? (raw as CompanionTopic)
    : null;
}

/**
 * Whether an existing conversation's saved messages have loaded into the
 * cached thread. Having data is not enough: useSendMessage writes optimistic
 * bubbles (negative ids) into the cache, so a message sent before the load
 * leaves a thread holding only that bubble. An existing conversation always has
 * saved messages, so it counts as loaded once a server row (positive id) is
 * there. Same rule as mobile (UnifyCN/mobile-app#317).
 */
export function isConversationHistoryLoaded(
  thread: readonly Pick<ChatMessage, "id">[],
): boolean {
  return thread.some((m) => m.id > 0);
}

/**
 * `turn_number` of the message being sent (companion_message_sent): earlier
 * user messages + 1, so the first message of a conversation is 1. `thread` is
 * the cached thread, which already holds this send's optimistic bubble, so it
 * is the count of user messages in it; optimistic bubbles of earlier sends
 * still in flight count too. Assistant replies do not.
 *
 * Undefined when the turn is unknown: an existing conversation whose saved
 * messages have not loaded yet. The event then leaves `turn_number` out rather
 * than guess.
 */
export function companionTurnNumber(
  thread: readonly Pick<ChatMessage, "id" | "role">[],
  isNewConversation: boolean,
): number | undefined {
  if (!isNewConversation && !isConversationHistoryLoaded(thread)) {
    return undefined;
  }
  return Math.max(1, thread.filter((m) => m.role === "user").length);
}
