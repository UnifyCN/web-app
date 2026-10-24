// Retrieved chunks to model context and citations (spec UnifyCN/web-app#177,
// ticket #181). The seam is buildRetrievedContext: the match_chunks rows go
// in, the context text the model reads and the sources the client shows come
// out. Row shape: report-344/345 (knowledge_documents carries published_at,
// fetched_at and chunk_source_url for that chunk).
//
// RUN (from web-app/):
//   deno test --no-check supabase/functions/rag-query/lib/retrievedContext_test.ts

import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import { buildRetrievedContext } from './retrievedContext.ts';

function chunk(
  id: number,
  documentId: number,
  text: string,
  doc: Record<string, unknown> = {}
) {
  return {
    id,
    document_id: documentId,
    chunk_index: id,
    chunk_text: text,
    similarity: 0.8,
    knowledge_documents: {
      id: documentId,
      title: `Doc ${documentId}`,
      storage_path: null,
      subject: 'pr',
      section: null,
      source_url: null,
      updated_at: '2026-10-01T00:00:00Z',
      published_at: null,
      fetched_at: null,
      chunk_source_url: null,
      ...doc,
    },
  };
}

Deno.test('each chunk carries its own published date beside its own text', () => {
  const { contextText } = buildRetrievedContext([
    chunk(1, 7, 'Express Entry draw #450 on 2026-10-14: minimum CRS 520.', {
      title: 'Express Entry Rounds',
      published_at: '2026-10-14',
    }),
    chunk(2, 7, 'Express Entry draw #449 on 2026-09-30: minimum CRS 535.', {
      title: 'Express Entry Rounds',
      published_at: '2026-09-30',
    }),
  ]);
  assertEquals(
    contextText,
    '[Document: Express Entry Rounds] (as of 2026-10-14)\n' +
      'Express Entry draw #450 on 2026-10-14: minimum CRS 520.\n\n' +
      '[Document: Express Entry Rounds] (as of 2026-09-30)\n' +
      'Express Entry draw #449 on 2026-09-30: minimum CRS 535.\n\n'
  );
});

Deno.test('fetched_at is the fallback, read as its UTC date', () => {
  const { contextText } = buildRetrievedContext([
    chunk(1, 3, 'A.', { fetched_at: '2026-10-20T23:30:00-05:00' }),
    chunk(2, 3, 'B.', { published_at: 'not a date', fetched_at: '2026-10-19T04:00:00Z' }),
    chunk(3, 3, 'C.', { published_at: '', fetched_at: '2026-10-18' }),
  ]);
  assertStringIncludes(contextText, '(as of 2026-10-21)\nA.');
  assertStringIncludes(contextText, '(as of 2026-10-19)\nB.');
  assertStringIncludes(contextText, '(as of 2026-10-18)\nC.');
});

Deno.test('published_at wins over fetched_at when both are present', () => {
  const { contextText } = buildRetrievedContext([
    chunk(1, 3, 'A.', { published_at: '2026-10-14', fetched_at: '2026-10-22T08:00:00Z' }),
  ]);
  assertStringIncludes(contextText, '(as of 2026-10-14)\nA.');
  assert(!contextText.includes('2026-10-22'), contextText);
});

Deno.test('a published timestamp is read as its UTC date', () => {
  const { contextText } = buildRetrievedContext([
    chunk(1, 3, 'A.', { published_at: '2026-10-20T23:30:00-05:00' }),
  ]);
  assertStringIncludes(contextText, '(as of 2026-10-21)\nA.');
});

Deno.test('without a source date the chunk says so; today is never invented', () => {
  const today = new Date().toISOString().slice(0, 10);
  const { contextText } = buildRetrievedContext([
    chunk(1, 4, 'Undated text.'),
    chunk(2, 4, 'Bad dates.', { published_at: '2026-02-30', fetched_at: 'yesterday' }),
  ]);
  assertStringIncludes(contextText, '[Document: Doc 4] (source date unknown)\nUndated text.');
  assertStringIncludes(contextText, '[Document: Doc 4] (source date unknown)\nBad dates.');
  assert(!contextText.includes('as of'), contextText);
  assert(!contextText.includes(today), contextText);
});

Deno.test('the document updated_at is not used as a source date', () => {
  const { contextText } = buildRetrievedContext([
    chunk(1, 4, 'Text.', { updated_at: '2026-10-22T00:00:00Z' }),
  ]);
  assert(!contextText.includes('2026-10-22'), contextText);
});

Deno.test('an untitled document is shown as Unknown', () => {
  const { contextText } = buildRetrievedContext([
    chunk(1, 4, 'Text.', { title: null, published_at: '2026-10-01' }),
  ]);
  assertStringIncludes(contextText, '[Document: Unknown] (as of 2026-10-01)');
});

Deno.test('no chunks: empty context, no sources, no lastVerified', () => {
  for (const rows of [[], null, undefined]) {
    assertEquals(buildRetrievedContext(rows), {
      contextText: '',
      sources: [],
      lastVerified: undefined,
    });
  }
});

Deno.test('citation: the article address wins, then the document address', () => {
  const { sources } = buildRetrievedContext([
    chunk(1, 9, 'News A.', {
      title: 'IRCC Newsroom',
      source_url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news.html',
      chunk_source_url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/a.html',
    }),
    chunk(2, 10, 'Page.', {
      title: 'OINP',
      source_url: 'https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp',
    }),
  ]);
  assertEquals(sources, [
    {
      document_id: 9,
      document_title: 'IRCC Newsroom',
      url: 'https://www.canada.ca/en/immigration-refugees-citizenship/news/2026/10/a.html',
    },
    {
      document_id: 10,
      document_title: 'OINP',
      url: 'https://www.ontario.ca/page/ontario-immigrant-nominee-program-oinp',
    },
  ]);
});

Deno.test('several news chunks of one document keep every distinct article address', () => {
  const news = 'https://www.canada.ca/en/immigration-refugees-citizenship/news.html';
  const { sources } = buildRetrievedContext([
    chunk(1, 9, 'A.', { title: 'IRCC Newsroom', source_url: news, chunk_source_url: 'https://x.test/a' }),
    chunk(2, 9, 'B.', { title: 'IRCC Newsroom', source_url: news, chunk_source_url: 'https://x.test/b' }),
    chunk(3, 9, 'A again.', { title: 'IRCC Newsroom', source_url: news, chunk_source_url: 'https://x.test/a' }),
    chunk(4, 9, 'No item address.', { title: 'IRCC Newsroom', source_url: news }),
    chunk(5, 9, 'No item address again.', { title: 'IRCC Newsroom', source_url: news }),
  ]);
  assertEquals(
    sources.map(s => [s.document_id, s.url]),
    [
      [9, 'https://x.test/a'],
      [9, 'https://x.test/b'],
      [9, news],
    ]
  );
});

Deno.test('the same address under two documents stays two citations', () => {
  const { sources } = buildRetrievedContext([
    chunk(1, 1, 'A.', { source_url: 'https://x.test/p' }),
    chunk(2, 2, 'B.', { source_url: 'https://x.test/p' }),
  ]);
  assertEquals(sources.map(s => s.document_id), [1, 2]);
});

Deno.test('a chunk address that is not http(s) is ignored', () => {
  const { sources } = buildRetrievedContext([
    chunk(1, 1, 'A.', { source_url: 'https://x.test/doc', chunk_source_url: 'javascript:alert(1)' }),
    chunk(2, 2, 'B.', { source_url: 'https://x.test/two', chunk_source_url: '' }),
  ]);
  assertEquals(sources.map(s => s.url), ['https://x.test/doc', 'https://x.test/two']);
});

Deno.test('with no address the S3 address is used when storage is set up, else no citation', () => {
  const rows = [chunk(1, 5, 'A.', { title: 'Guide', storage_path: 'kb/guide.pdf' })];
  assertEquals(
    buildRetrievedContext(rows, { bucket: 'unify-kb', region: 'ca-central-1' }).sources,
    [
      {
        document_id: 5,
        document_title: 'Guide',
        url: 'https://unify-kb.s3.ca-central-1.amazonaws.com/kb/guide.pdf',
      },
    ]
  );
  assertEquals(buildRetrievedContext(rows).sources, []);
  assertEquals(
    buildRetrievedContext(rows, { bucket: 'your-bucket-name', region: 'ca-central-1' }).sources,
    []
  );
  // The context text is still built for an unattributed document.
  assertStringIncludes(buildRetrievedContext(rows).contextText, '[Document: Guide]');
});

Deno.test('the source shape is document_id, document_title, url only', () => {
  const { sources } = buildRetrievedContext([
    chunk(1, 1, 'A.', { title: 'T', source_url: 'https://x.test/p', chunk_source_url: 'https://x.test/q' }),
  ]);
  assertEquals(Object.keys(sources[0]).sort(), ['document_id', 'document_title', 'url']);
});

Deno.test('lastVerified is the newest document updated_at', () => {
  const { lastVerified } = buildRetrievedContext([
    chunk(1, 1, 'A.', { updated_at: '2026-09-01T00:00:00Z' }),
    chunk(2, 2, 'B.', { updated_at: '2026-10-05T00:00:00Z' }),
    chunk(3, 3, 'C.', { updated_at: null }),
  ]);
  assertEquals(lastVerified, '2026-10-05T00:00:00Z');
});
