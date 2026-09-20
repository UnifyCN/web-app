// Per-type contract for `translate-content` — the one place that knows where a
// translatable row's text lives.
//
// WHY A SEPARATE MODULE. index.ts is a single `Deno.serve` handler and cannot be
// imported without starting a server, so none of this was reachable from a test
// while it lived there as nested ternaries. Every per-type difference (source
// table, title/body columns, id shape, cache table) is data here, and
// contentTypes_test.ts asserts each one against the real column names — the
// failure mode this replaces is a typo'd column that only shows up as a 500 in
// production.
//
// Adding a type = one entry in CONTENT_TYPES + its cache table in a migration +
// the client allowlist (services/translations.ts, app/api/translate/route.ts).

/** Minimal shape of the source-row reader we need — lets tests pass a stub. */
export interface SourceReader {
  from(table: string): {
    select(columns: string): {
      eq(
        column: string,
        value: number | string,
      ): {
        maybeSingle(): Promise<{
          data: Record<string, unknown> | null;
          error: unknown;
        }>;
      };
    };
  };
}

export interface ContentTypeConfig {
  /** Source table. Every one of them keys on an `id` column. */
  readonly table: string;
  /** Column holding the headline, or null for content-only types. */
  readonly titleColumn: string | null;
  /** Column holding the body text. */
  readonly contentColumn: string;
  /** Used when contentColumn is empty — see `tip` below. */
  readonly fallbackContentColumn: string | null;
  /**
   * Set when the row is private to one user. The service-role read bypasses
   * RLS, so the handler must re-check this column against the caller.
   */
  readonly ownerColumn: string | null;
  /** `int` = serial primary key, `uuid` = uuid primary key. */
  readonly idKind: 'int' | 'uuid';
  /** Cache table holding this type's translations. */
  readonly cacheTable: string;
  /** FK column in the cache table pointing back at the source row. */
  readonly cacheIdColumn: string;
  /** 404 message, kept per type so the client can tell what was missing. */
  readonly notFound: string;
}

export const CONTENT_TYPES: Record<string, ContentTypeConfig> = {
  post: {
    table: 'posts',
    titleColumn: 'title',
    contentColumn: 'content',
    fallbackContentColumn: null,
    ownerColumn: null,
    idKind: 'int',
    cacheTable: 'post_translations',
    cacheIdColumn: 'post_id',
    notFound: 'Post not found',
  },
  comment: {
    table: 'post_comments',
    titleColumn: null,
    contentColumn: 'content',
    fallbackContentColumn: null,
    ownerColumn: null,
    idKind: 'int',
    cacheTable: 'comment_translations',
    cacheIdColumn: 'comment_id',
    notFound: 'Comment not found',
  },
  discussion: {
    table: 'module_discussions',
    titleColumn: null,
    contentColumn: 'body',
    fallbackContentColumn: null,
    ownerColumn: null,
    idKind: 'uuid',
    cacheTable: 'discussion_translations',
    cacheIdColumn: 'discussion_id',
    notFound: 'Discussion not found',
  },
  discussion_reply: {
    table: 'discussion_replies',
    titleColumn: null,
    contentColumn: 'body',
    fallbackContentColumn: null,
    ownerColumn: null,
    idKind: 'uuid',
    cacheTable: 'discussion_reply_translations',
    cacheIdColumn: 'reply_id',
    notFound: 'Reply not found',
  },
  // events.id / groups.id are integer serials, like posts/comments. Both tables
  // carry a world-readable select policy, so the service-role fetch is safe.
  event: {
    table: 'events',
    titleColumn: 'title',
    contentColumn: 'description',
    fallbackContentColumn: null,
    ownerColumn: null,
    idKind: 'int',
    cacheTable: 'event_translations',
    cacheIdColumn: 'event_id',
    notFound: 'Event not found',
  },
  group: {
    table: 'groups',
    titleColumn: 'group_name',
    contentColumn: 'group_description',
    fallbackContentColumn: null,
    ownerColumn: null,
    idKind: 'int',
    cacheTable: 'group_translations',
    cacheIdColumn: 'group_id',
    notFound: 'Group not found',
  },
  // daily_tips is the odd one twice over. Its id is a uuid, and it is the only
  // PRIVATE source: `user_id = auth.uid()` is its sole select policy, so a
  // service-role read of someone else's tip would leak it — hence ownerColumn.
  // `tip_text` is the long-form body; rows that predate it (or that the
  // generator left short) only filled `description`, so that is the fallback.
  tip: {
    table: 'daily_tips',
    titleColumn: 'title',
    contentColumn: 'tip_text',
    fallbackContentColumn: 'description',
    ownerColumn: 'user_id',
    idKind: 'uuid',
    cacheTable: 'tip_translations',
    cacheIdColumn: 'tip_id',
    notFound: 'Tip not found',
  },
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** The supported `type` values, in declaration order, for error messages. */
export function supportedTypes(): string[] {
  return Object.keys(CONTENT_TYPES);
}

/** Config for a request's `type`, or null when it isn't a supported type. */
export function resolveContentType(value: unknown): ContentTypeConfig | null {
  if (typeof value !== 'string') return null;
  if (!Object.prototype.hasOwnProperty.call(CONTENT_TYPES, value)) return null;
  return CONTENT_TYPES[value];
}

/**
 * Validate a request id against the type's key shape. Integer types accept a
 * positive integer or its decimal string; uuid types accept a uuid string only.
 * Returns the value to query with, or null when it is unusable.
 */
export function resolveId(
  config: ContentTypeConfig,
  id: unknown,
): number | string | null {
  if (config.idKind === 'uuid') {
    return typeof id === 'string' && UUID_RE.test(id) ? id : null;
  }
  if (typeof id === 'number' && Number.isInteger(id) && id > 0) return id;
  if (typeof id === 'string' && /^\d+$/.test(id)) {
    const n = Number(id);
    return Number.isInteger(n) && n > 0 ? n : null;
  }
  return null;
}

/** PostgREST select list for the source row — only the columns this type uses. */
export function sourceSelectColumns(config: ContentTypeConfig): string {
  return [
    config.titleColumn,
    config.contentColumn,
    config.fallbackContentColumn,
    config.ownerColumn,
  ]
    .filter((c): c is string => Boolean(c))
    .join(', ');
}

/**
 * Pull the translatable title/body out of a fetched row. An empty or
 * whitespace-only body falls back to `fallbackContentColumn` when the type has
 * one; the caller still rejects a pair that is empty both ways.
 */
export function extractSource(
  config: ContentTypeConfig,
  row: Record<string, unknown>,
): { title: string | null; content: string } {
  const rawTitle = config.titleColumn ? row[config.titleColumn] : null;
  const title = typeof rawTitle === 'string' && rawTitle.length > 0 ? rawTitle : null;

  const rawContent = row[config.contentColumn];
  let content = typeof rawContent === 'string' ? rawContent : '';
  if (!content.trim() && config.fallbackContentColumn) {
    const fallback = row[config.fallbackContentColumn];
    content = typeof fallback === 'string' ? fallback : '';
  }
  return { title, content };
}

/** True when a private type's row does not belong to the calling user. */
export function isForbiddenOwner(
  config: ContentTypeConfig,
  row: Record<string, unknown>,
  userId: string,
): boolean {
  if (!config.ownerColumn) return false;
  return row[config.ownerColumn] !== userId;
}

/** Cache-table select list — only post-like types store a translated title. */
export function cacheSelectColumns(config: ContentTypeConfig): string {
  return config.titleColumn
    ? 'translated_title, translated_content, source_lang, source_hash'
    : 'translated_content, source_lang, source_hash';
}

/** Read the source row with the service role. Returns null when it is absent. */
export async function fetchSourceRow(
  client: SourceReader,
  config: ContentTypeConfig,
  id: number | string,
): Promise<{ row: Record<string, unknown> | null; error: unknown }> {
  const { data, error } = await client
    .from(config.table)
    .select(sourceSelectColumns(config))
    .eq('id', id)
    .maybeSingle();
  return { row: data ?? null, error };
}
