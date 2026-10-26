/**
 * Unsent Companion messages, held in memory per account and per conversation
 * (mobile-app#361). The composer reads its draft from here, so opening a panel,
 * leaving for Checklist and coming back keep the text. Only send, clear or an
 * account change discards it; another account never sees it.
 */
type Listener = () => void;

const drafts = new Map<string, Map<string, string>>();
const listeners = new Set<Listener>();
const notify = () => {
  for (const l of listeners) l();
};

/** Conversation key of the composer before a conversation exists. */
export const NEW_CONVERSATION = "new";

export function subscribeComposerDrafts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function composerDraft(
  accountId: string | null,
  conversationKey: string,
): string {
  if (!accountId) return "";
  return drafts.get(accountId)?.get(conversationKey) ?? "";
}

export function setComposerDraft(
  accountId: string | null,
  conversationKey: string,
  text: string,
) {
  if (!accountId) return;
  let own = drafts.get(accountId);
  if (!own) {
    own = new Map();
    drafts.set(accountId, own);
  }
  if (text) own.set(conversationKey, text);
  else own.delete(conversationKey);
  notify();
}

/** Drop every account's unsent messages except `keepAccountId`. */
export function clearComposerDrafts(keepAccountId?: string | null) {
  let changed = false;
  for (const id of [...drafts.keys()]) {
    if (id !== keepAccountId) {
      drafts.delete(id);
      changed = true;
    }
  }
  if (changed) notify();
}
