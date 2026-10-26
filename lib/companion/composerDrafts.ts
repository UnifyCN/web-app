/**
 * The unsent Companion message, held in memory per account (mobile-app#361).
 * The composer reads its draft from here, so opening a panel, leaving for
 * Checklist and coming back, or losing access to the open conversation keep
 * the text. Only send, clear or an account change discards it; another account
 * never sees it.
 */
type Listener = () => void;

const drafts = new Map<string, string>();
const listeners = new Set<Listener>();
const notify = () => {
  for (const l of listeners) l();
};

export function subscribeComposerDrafts(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function composerDraft(accountId: string | null): string {
  if (!accountId) return "";
  return drafts.get(accountId) ?? "";
}

export function setComposerDraft(accountId: string | null, text: string) {
  if (!accountId) return;
  if (text) drafts.set(accountId, text);
  else drafts.delete(accountId);
  notify();
}

/** Drop every account's unsent message except `keepAccountId`. */
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
