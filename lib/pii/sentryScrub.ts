import { scrubEmailDeep } from "./scrubEmail";

/**
 * Sentry `init` hooks that strip `?email=` from events, transactions and
 * breadcrumbs (request URLs, query strings, transaction names, navigation
 * `from`/`to`, fetch URLs). Spread into every runtime's `Sentry.init` —
 * client, Node server and edge — so /verify-email and /reset-password URLs
 * never reach Sentry with the address in them. Generic so the same object fits
 * each runtime's option types.
 */
export const sentryPiiHooks = {
  beforeSend: <T>(event: T): T => scrubEmailDeep(event),
  beforeSendTransaction: <T>(event: T): T => scrubEmailDeep(event),
  beforeBreadcrumb: <T>(breadcrumb: T): T => scrubEmailDeep(breadcrumb),
};
