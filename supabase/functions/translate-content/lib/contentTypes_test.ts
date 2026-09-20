// Traps for the translate-content per-type contract.
//
// WHY THIS FILE EXISTS. Every difference between translatable types is data in
// CONTENT_TYPES — a table name, two column names, an id shape, a cache table.
// None of it is type-checked against the database, so a wrong column name is a
// clean-compiling 500 that only appears when a user presses Translate on that
// one kind of content. The column names asserted below were captured from the
// live schema:
//
//   select table_name, column_name, data_type from information_schema.columns
//   where table_name in ('events','groups','daily_tips');
//
//   events      id integer, title text,      description text
//   groups      id integer, group_name varchar, group_description text
//   daily_tips  id uuid,    title text,      tip_text text, description text,
//               user_id uuid
//
// RUN (from web-app/):
//   deno test supabase/functions/translate-content/lib/contentTypes_test.ts

import { assert, assertEquals } from 'jsr:@std/assert@1';
import {
  CONTENT_TYPES,
  cacheSelectColumns,
  extractSource,
  fetchSourceRow,
  isForbiddenOwner,
  resolveContentType,
  resolveId,
  sourceSelectColumns,
  supportedTypes,
  type ContentTypeConfig,
  type SourceReader,
} from './contentTypes.ts';

const UUID = '3f2504e0-4f89-11d3-9a0c-0305e82c3301';
const OTHER_UUID = '11111111-2222-3333-4444-555555555555';

function config(type: string): ContentTypeConfig {
  const c = resolveContentType(type);
  assert(c, `expected '${type}' to be a supported type`);
  return c;
}

// ---------------------------------------------------------------------------
// The four pre-existing types must keep working exactly as they did — this file
// landed alongside event/group/tip, so it is also the regression net for them.
// ---------------------------------------------------------------------------

Deno.test('supported types cover the old four plus event/group/tip', () => {
  assertEquals(supportedTypes(), [
    'post',
    'comment',
    'discussion',
    'discussion_reply',
    'event',
    'group',
    'tip',
  ]);
});

Deno.test('pre-existing types keep their table, columns and cache', () => {
  assertEquals(config('post').table, 'posts');
  assertEquals(config('post').titleColumn, 'title');
  assertEquals(config('post').contentColumn, 'content');
  assertEquals(config('post').cacheTable, 'post_translations');
  assertEquals(config('post').cacheIdColumn, 'post_id');

  assertEquals(config('comment').table, 'post_comments');
  assertEquals(config('comment').titleColumn, null);
  assertEquals(config('comment').cacheIdColumn, 'comment_id');

  assertEquals(config('discussion').table, 'module_discussions');
  assertEquals(config('discussion').contentColumn, 'body');
  assertEquals(config('discussion').idKind, 'uuid');

  assertEquals(config('discussion_reply').table, 'discussion_replies');
  assertEquals(config('discussion_reply').cacheIdColumn, 'reply_id');
});

// ---------------------------------------------------------------------------
// The three new types.
// ---------------------------------------------------------------------------

Deno.test("event maps title -> translatedTitle, description -> content", () => {
  const c = config('event');
  assertEquals(c.table, 'events');
  assertEquals(c.titleColumn, 'title');
  assertEquals(c.contentColumn, 'description');
  assertEquals(c.fallbackContentColumn, null);
  assertEquals(c.idKind, 'int'); // events.id is an integer serial
  assertEquals(c.ownerColumn, null); // events are world-readable
  assertEquals(c.cacheTable, 'event_translations');
  assertEquals(c.cacheIdColumn, 'event_id');
  assertEquals(c.notFound, 'Event not found');
});

Deno.test('group maps group_name/group_description, not title/description', () => {
  const c = config('group');
  assertEquals(c.table, 'groups');
  // The trap: `groups` has NO `title`/`description` column. Copying the event
  // entry verbatim compiles and 500s at runtime.
  assertEquals(c.titleColumn, 'group_name');
  assertEquals(c.contentColumn, 'group_description');
  assertEquals(c.idKind, 'int');
  assertEquals(c.ownerColumn, null);
  assertEquals(c.cacheTable, 'group_translations');
  assertEquals(c.cacheIdColumn, 'group_id');
  assertEquals(c.notFound, 'Group not found');
});

Deno.test('tip is uuid-keyed, owner-scoped, and falls back to description', () => {
  const c = config('tip');
  assertEquals(c.table, 'daily_tips');
  assertEquals(c.titleColumn, 'title');
  assertEquals(c.contentColumn, 'tip_text');
  assertEquals(c.fallbackContentColumn, 'description');
  assertEquals(c.idKind, 'uuid'); // daily_tips.id is a uuid, unlike events/groups
  assertEquals(c.ownerColumn, 'user_id'); // private rows — see the file header
  assertEquals(c.cacheTable, 'tip_translations');
  assertEquals(c.cacheIdColumn, 'tip_id');
  assertEquals(c.notFound, 'Tip not found');
});

Deno.test('every type has its own cache table and FK column', () => {
  const tables = Object.values(CONTENT_TYPES).map(c => c.cacheTable);
  const columns = Object.values(CONTENT_TYPES).map(c => c.cacheIdColumn);
  assertEquals(new Set(tables).size, tables.length);
  assertEquals(new Set(columns).size, columns.length);
});

// ---------------------------------------------------------------------------
// resolveContentType
// ---------------------------------------------------------------------------

Deno.test('resolveContentType rejects unknown and non-string types', () => {
  assertEquals(resolveContentType('events'), null); // plural, a likely typo
  assertEquals(resolveContentType('Tip'), null); // case-sensitive
  assertEquals(resolveContentType(''), null);
  assertEquals(resolveContentType(null), null);
  assertEquals(resolveContentType(undefined), null);
  assertEquals(resolveContentType(7), null);
  assertEquals(resolveContentType({ type: 'tip' }), null);
});

Deno.test('resolveContentType does not resolve inherited object keys', () => {
  // A plain-object lookup would hand back Object.prototype.constructor here.
  assertEquals(resolveContentType('constructor'), null);
  assertEquals(resolveContentType('toString'), null);
  assertEquals(resolveContentType('__proto__'), null);
});

// ---------------------------------------------------------------------------
// resolveId
// ---------------------------------------------------------------------------

Deno.test('integer types accept a positive integer or its decimal string', () => {
  for (const type of ['event', 'group']) {
    const c = config(type);
    assertEquals(resolveId(c, 12), 12);
    assertEquals(resolveId(c, '12'), 12);
    assertEquals(resolveId(c, 0), null);
    assertEquals(resolveId(c, -3), null);
    assertEquals(resolveId(c, 1.5), null);
    assertEquals(resolveId(c, '12abc'), null);
    assertEquals(resolveId(c, UUID), null);
    assertEquals(resolveId(c, null), null);
  }
});

Deno.test('tip accepts a uuid only — an integer id must not reach the query', () => {
  const c = config('tip');
  assertEquals(resolveId(c, UUID), UUID);
  assertEquals(resolveId(c, UUID.toUpperCase()), UUID.toUpperCase());
  assertEquals(resolveId(c, 12), null);
  assertEquals(resolveId(c, '12'), null);
  assertEquals(resolveId(c, 'not-a-uuid'), null);
  assertEquals(resolveId(c, `${UUID}extra`), null);
});

// ---------------------------------------------------------------------------
// sourceSelectColumns / extractSource
// ---------------------------------------------------------------------------

Deno.test('select list names only the columns each type reads', () => {
  assertEquals(sourceSelectColumns(config('event')), 'title, description');
  assertEquals(
    sourceSelectColumns(config('group')),
    'group_name, group_description',
  );
  // tip pulls the fallback body AND the owner column it is checked against.
  assertEquals(
    sourceSelectColumns(config('tip')),
    'title, tip_text, description, user_id',
  );
  assertEquals(sourceSelectColumns(config('comment')), 'content');
});

Deno.test('extractSource reads event and group rows', () => {
  assertEquals(
    extractSource(config('event'), {
      title: 'Newcomer Job Fair',
      description: 'Meet employers hiring newcomers.',
    }),
    { title: 'Newcomer Job Fair', content: 'Meet employers hiring newcomers.' },
  );
  assertEquals(
    extractSource(config('group'), {
      group_name: 'Vancouver Newcomers',
      group_description: 'A group for new arrivals in Vancouver.',
    }),
    {
      title: 'Vancouver Newcomers',
      content: 'A group for new arrivals in Vancouver.',
    },
  );
});

Deno.test('tip prefers tip_text and falls back to description', () => {
  assertEquals(
    extractSource(config('tip'), {
      title: 'Open a bank account',
      tip_text: 'Bring your SIN and photo ID.',
      description: 'Banking basics.',
    }),
    { title: 'Open a bank account', content: 'Bring your SIN and photo ID.' },
  );
  // Empty, null and whitespace-only tip_text all fall through.
  for (const tip_text of ['', null, '   \n  ', undefined]) {
    assertEquals(
      extractSource(config('tip'), {
        title: 'Open a bank account',
        tip_text,
        description: 'Banking basics.',
      }).content,
      'Banking basics.',
    );
  }
  // Both empty stays empty — the handler answers 'Nothing to translate'.
  assertEquals(
    extractSource(config('tip'), { title: 'T', tip_text: '', description: null })
      .content,
    '',
  );
});

Deno.test('a content-only type never reports a title', () => {
  // Even if the row happens to carry a `title` column, comment must not use it.
  assertEquals(
    extractSource(config('comment'), { content: 'Thanks!', title: 'ignored' }),
    { title: null, content: 'Thanks!' },
  );
});

Deno.test('an empty-string title is reported as null, not as a title', () => {
  assertEquals(
    extractSource(config('event'), { title: '', description: 'Body' }).title,
    null,
  );
});

// ---------------------------------------------------------------------------
// Ownership — the one type where a service-role read can leak.
// ---------------------------------------------------------------------------

Deno.test('a tip belonging to another user is forbidden', () => {
  const c = config('tip');
  assertEquals(isForbiddenOwner(c, { user_id: UUID }, UUID), false);
  assertEquals(isForbiddenOwner(c, { user_id: OTHER_UUID }, UUID), true);
  // A tip with no owner is nobody's to read through this path.
  assertEquals(isForbiddenOwner(c, { user_id: null }, UUID), true);
  assertEquals(isForbiddenOwner(c, {}, UUID), true);
});

Deno.test('public types are never owner-gated', () => {
  for (const type of ['post', 'comment', 'discussion', 'event', 'group']) {
    assertEquals(isForbiddenOwner(config(type), { user_id: OTHER_UUID }, UUID), false);
  }
});

// ---------------------------------------------------------------------------
// Cache select list
// ---------------------------------------------------------------------------

Deno.test('title-bearing types select translated_title, others do not', () => {
  for (const type of ['post', 'event', 'group', 'tip']) {
    assert(cacheSelectColumns(config(type)).includes('translated_title'));
  }
  for (const type of ['comment', 'discussion', 'discussion_reply']) {
    assert(!cacheSelectColumns(config(type)).includes('translated_title'));
  }
});

// ---------------------------------------------------------------------------
// fetchSourceRow — the query actually issued, against a stub client.
// ---------------------------------------------------------------------------

interface Issued {
  table: string;
  columns: string;
  idColumn: string;
  idValue: number | string;
}

function stubClient(
  row: Record<string, unknown> | null,
  issued: Issued[],
  error: unknown = null,
): SourceReader {
  return {
    from(table: string) {
      return {
        select(columns: string) {
          return {
            eq(idColumn: string, idValue: number | string) {
              return {
                maybeSingle() {
                  issued.push({ table, columns, idColumn, idValue });
                  return Promise.resolve({ data: row, error });
                },
              };
            },
          };
        },
      };
    },
  };
}

Deno.test('fetchSourceRow queries events by integer id', async () => {
  const issued: Issued[] = [];
  const { row, error } = await fetchSourceRow(
    stubClient({ title: 'Job Fair', description: 'Body' }, issued),
    config('event'),
    42,
  );
  assertEquals(issued, [
    { table: 'events', columns: 'title, description', idColumn: 'id', idValue: 42 },
  ]);
  assertEquals(error, null);
  assertEquals(extractSource(config('event'), row!), {
    title: 'Job Fair',
    content: 'Body',
  });
});

Deno.test('fetchSourceRow queries groups by integer id', async () => {
  const issued: Issued[] = [];
  const { row } = await fetchSourceRow(
    stubClient({ group_name: 'G', group_description: 'D' }, issued),
    config('group'),
    7,
  );
  assertEquals(issued, [
    {
      table: 'groups',
      columns: 'group_name, group_description',
      idColumn: 'id',
      idValue: 7,
    },
  ]);
  assertEquals(extractSource(config('group'), row!), {
    title: 'G',
    content: 'D',
  });
});

Deno.test('fetchSourceRow queries daily_tips by uuid and carries the owner', async () => {
  const issued: Issued[] = [];
  const { row } = await fetchSourceRow(
    stubClient(
      { title: 'T', tip_text: 'Body', description: 'Short', user_id: UUID },
      issued,
    ),
    config('tip'),
    UUID,
  );
  assertEquals(issued, [
    {
      table: 'daily_tips',
      columns: 'title, tip_text, description, user_id',
      idColumn: 'id',
      idValue: UUID,
    },
  ]);
  assertEquals(isForbiddenOwner(config('tip'), row!, UUID), false);
  assertEquals(isForbiddenOwner(config('tip'), row!, OTHER_UUID), true);
});

Deno.test('fetchSourceRow reports a missing row as null, not as an error', async () => {
  const issued: Issued[] = [];
  const { row, error } = await fetchSourceRow(
    stubClient(null, issued),
    config('tip'),
    UUID,
  );
  assertEquals(row, null);
  assertEquals(error, null);
});

Deno.test('fetchSourceRow surfaces a lookup error', async () => {
  const issued: Issued[] = [];
  const { row, error } = await fetchSourceRow(
    stubClient(null, issued, { message: 'boom' }),
    config('event'),
    1,
  );
  assertEquals(row, null);
  assertEquals(error, { message: 'boom' });
});
