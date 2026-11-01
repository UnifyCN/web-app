/**
 * Which account owns work in flight (mobile-app#361). `epoch` changes only when
 * the known signed-in account changes (another account, sign-out, sign-in); a
 * token refresh of the same account keeps it. Work started for one account
 * checks `stillOwned` before it sends another request or writes a result.
 */
let known: string | null | undefined;
let epoch = 0;
const listeners = new Set<() => void>();
let notificationQueued = false;

export const accountEpoch = () => epoch;
export function subscribeAccountEpoch(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** Records the signed-in account. Idempotent; safe to call while rendering. */
export function noteAccount(accountId: string | null) {
  const changed = known !== undefined && known !== accountId;
  if (changed) epoch += 1;
  known = accountId;
  if (changed && !notificationQueued) {
    notificationQueued = true;
    // The owner changes synchronously. Notify React after a possible render
    // has finished; the final epoch still includes every batched auth event.
    queueMicrotask(() => {
      notificationQueued = false;
      for (const listener of listeners) listener();
    });
  }
}

export interface AccountOwner {
  accountId: string | null;
  epoch: number;
}

/** Marks work as started for the account signed in now. */
export const ownAccountWork = (): AccountOwner => ({
  accountId: known ?? null,
  epoch,
});

/** True while the account that started `owner`'s work is still signed in. */
export const stillOwned = (owner: AccountOwner) =>
  owner.epoch === epoch && owner.accountId === (known ?? null);

/** Thrown to stop work whose account is no longer signed in. Never shown. */
export class AccountChangedError extends Error {
  constructor() {
    super("The signed-in account changed");
    this.name = "AccountChangedError";
  }
}

/**
 * Stops `owner`'s work before its next request or result unless its account is
 * still signed in and, when given, the session user the request would be made
 * as (`userId`) is that account. Work started before the account was known has
 * no owner and makes no authenticated request.
 */
export function assertOwned(owner: AccountOwner, userId?: string | null) {
  if (!stillOwned(owner)) throw new AccountChangedError();
  if (userId !== undefined && userId !== owner.accountId)
    throw new AccountChangedError();
}
