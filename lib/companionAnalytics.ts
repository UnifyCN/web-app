import type { ChatMessage } from "@/types";

/**
 * Companion analytics vocabulary shared with mobile (spec
 * UnifyCN/mobile-app#314). Metadata only: the question text never goes into a
 * client event.
 */

/** The topic labels rag-query puts on an answer (fixed list, approved
 *  2026-10-21). Keep in sync with supabase/functions/rag-query/lib/topic.ts. */
export const COMPANION_TOPICS = [
  "immigration",
  "work",
  "housing",
  "money",
  "taxes",
  "health",
  "education",
  "transportation",
  "settling_in",
  "other",
] as const;

export type CompanionTopic = (typeof COMPANION_TOPICS)[number];

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
 * `turn_number` of the message being sent: the user messages in the cached
 * thread, which already holds this send's optimistic bubble (so the first
 * message of a conversation is 1). Optimistic bubbles of earlier sends that are
 * still in flight count too.
 */
export function companionTurnNumber(
  thread: readonly Pick<ChatMessage, "role">[],
): number {
  return Math.max(1, thread.filter((m) => m.role === "user").length);
}
