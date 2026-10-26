/**
 * Which account owns work in flight (mobile-app#361). `epoch` changes only when
 * the known signed-in account changes (another account, sign-out, sign-in); a
 * token refresh of the same account keeps it. Work started for one account
 * checks `stillOwned` before it sends another request or writes a result.
 */
let known: string | null | undefined;
let epoch = 0;

/** Records the signed-in account. Idempotent; safe to call while rendering. */
export function noteAccount(accountId: string | null) {
  if (known !== undefined && known !== accountId) epoch += 1;
  known = accountId;
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
