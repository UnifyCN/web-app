// Turns the match_chunks rows into the context text the model reads and the
// sources the client shows. Each chunk carries its own source date beside its
// own text, so the model can say "as of <date>" for the chunk it used. Rows
// come from the SQL contract in mobile-app migrations 20261024044652 and
// 20261024052950: knowledge_documents holds that chunk's published_at,
// fetched_at and chunk_source_url next to the document's own columns.
import { formatIsoDate, parseUtcDate } from './dates.ts';

export type Source = {
  document_id: number;
  document_title: string;
  url: string;
};

export type StorageConfig = { bucket?: string; region?: string };

export type RetrievedContext = {
  contextText: string;
  sources: Source[];
  lastVerified: string | undefined;
};

/** The chunk's source date (published_at, else fetched_at) as UTC YYYY-MM-DD, or null. */
function chunkDate(doc: Record<string, unknown>): string | null {
  for (const value of [doc.published_at, doc.fetched_at]) {
    const date = parseUtcDate(value);
    if (date) return formatIsoDate(date);
  }
  return null;
}

function httpUrl(value: unknown): string | null {
  return typeof value === 'string' && /^https?:\/\//i.test(value.trim())
    ? value.trim()
    : null;
}

/**
 * Citation address: the article address of that chunk, then the document's
 * human source page, then an S3 address when storage is configured. A document
 * with none is left unattributed (no generic fallback that would misattribute).
 */
function citationUrl(
  doc: Record<string, unknown>,
  storage: StorageConfig
): string | null {
  const bucket = storage.bucket;
  const storagePath = typeof doc.storage_path === 'string' ? doc.storage_path : '';
  const hasStorage =
    !!bucket && bucket !== 'your-bucket-name' && !!storage.region && !!storagePath;
  const s3Url = hasStorage
    ? `https://${bucket}.s3.${storage.region}.amazonaws.com/${storagePath}`
    : null;
  return httpUrl(doc.chunk_source_url) ?? (doc.source_url ? String(doc.source_url) : null) ?? s3Url;
}

export function buildRetrievedContext(
  chunks: unknown,
  storage: StorageConfig = {}
): RetrievedContext {
  const rows = Array.isArray(chunks) ? chunks : [];
  let contextText = '';
  let lastVerified: string | undefined;
  const sources = new Map<string, Source>();

  for (const chunk of rows) {
    const doc = (chunk.knowledge_documents ?? {}) as Record<string, unknown>;
    const title = (doc.title as string | null) || 'Unknown';
    const date = chunkDate(doc);
    contextText += `[Document: ${title}] ${
      date ? `(as of ${date})` : '(source date unknown)'
    }\n${chunk.chunk_text}\n\n`;

    const updatedAt = doc.updated_at as string | null | undefined;
    if (updatedAt && (!lastVerified || updatedAt > lastVerified)) {
      lastVerified = updatedAt;
    }

    const url = citationUrl(doc, storage);
    if (url) {
      // Several chunks of one document (news items) can have distinct article
      // addresses, so a citation is one (document, address) pair.
      const key = `${chunk.document_id}\n${url}`;
      if (!sources.has(key)) {
        sources.set(key, {
          document_id: chunk.document_id,
          document_title: title,
          url,
        });
      }
    }
  }

  return { contextText, sources: [...sources.values()], lastVerified };
}
