/**
 * The unsent Companion message, held in memory per account (mobile-app#361).
 * The composer reads its draft from here, so opening a panel, leaving for
 * Checklist and coming back, or losing access to the open conversation keep
 * the text. Only send, clear or an account change discards it; another account
 * never sees it.
 */
import { ownAccountWork, type AccountOwner } from "@/lib/accountSession";

type Listener = () => void;

const drafts = new Map<string, string>();
// Text entered before Auth resolves stays separate from stored account drafts.
let pendingDraft: { owner: AccountOwner; text: string } | null = null;
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
  const owner = ownAccountWork();
  const pending = currentPendingDraft(owner);
  if (pending && (accountId === null || accountId === owner.accountId))
    return pending.text;
  if (!accountId) return "";
  return drafts.get(accountId) ?? "";
}

function currentPendingDraft(owner: AccountOwner) {
  return pendingDraft &&
    pendingDraft.owner.epoch === owner.epoch &&
    (pendingDraft.owner.accountId === null ||
      pendingDraft.owner.accountId === owner.accountId)
    ? pendingDraft
    : null;
}

export function setComposerDraft(
  accountId: string | null,
  text: string,
  expectedEpoch: number,
) {
  const owner = ownAccountWork();
  if (owner.epoch !== expectedEpoch) return;
  if (accountId === null) pendingDraft = { owner, text };
  else {
    if (owner.accountId !== accountId) return;
    pendingDraft = null;
    if (text) drafts.set(accountId, text);
    else drafts.delete(accountId);
  }
  notify();
}

/** Drop other account drafts. Auth can retain first-session input by owner. */
export function clearComposerDrafts(
  keepAccountId?: string | null,
  preservePendingOwner?: AccountOwner,
) {
  let changed = false;
  const preservePending =
    pendingDraft &&
    preservePendingOwner &&
    pendingDraft.owner.accountId === preservePendingOwner.accountId &&
    pendingDraft.owner.epoch === preservePendingOwner.epoch &&
    currentPendingDraft(ownAccountWork()) === pendingDraft;
  if (
    pendingDraft &&
    !preservePending &&
    (keepAccountId == null ||
      !currentPendingDraft(ownAccountWork()) ||
      (pendingDraft.owner.accountId !== null &&
        pendingDraft.owner.accountId !== keepAccountId))
  ) {
    pendingDraft = null;
    changed = true;
  }
  for (const id of [...drafts.keys()]) {
    if (id !== keepAccountId) {
      drafts.delete(id);
      changed = true;
    }
  }
  if (changed) notify();
}
