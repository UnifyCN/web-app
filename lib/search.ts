/**
 * Shared helpers for the Social search (posts / people / groups), ported from
 * the mobile app's `app/search.tsx` + `services/{users,groups,posts}` search
 * queries.
 */

/** Max rows per search section, matching mobile (users 20, posts 50). */
export const SEARCH_USERS_LIMIT = 20;
export const SEARCH_POSTS_LIMIT = 50;
export const SEARCH_GROUPS_LIMIT = 50;

/**
 * A `%term%` pattern for PostgREST `.ilike()`, with the LIKE metacharacters
 * (`\`, `%`, `_`) escaped so a search for "50%" or "first_name" matches those
 * characters literally (mobile's `safeQuery`). Only ever passed as the value of
 * `.ilike(column, pattern)`, never spliced into an `.or()` filter string, so
 * commas / parentheses in the term can't change the filter.
 */
export function ilikeContains(term: string): string {
  return `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** The trimmed search term, or "" when there's nothing to search for. */
export function normalizeSearchTerm(raw: string): string {
  return raw.trim().replace(/\s+/g, " ");
}
