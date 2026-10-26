// External guidance for the Companion: search for official pages, then read
// them here, so every source the answer shows has a real URL, a publisher from
// our own registry and the time this server actually read it.
//
// Search uses the existing OpenRouter key (web plugin, Exa engine, at most
// MAX_RESULTS results limited to official domains). No new service or key.
// Reads are GETs to official Canadian government domains only: https, public
// addresses (shared SSRF guard), redirects re-checked hop by hop, a time limit
// and a size limit. Page text is reduced to plain text and goes to the model as
// quoted data. Nothing on a page is followed, executed or obeyed: links in the
// text are never fetched, and the page cannot name its own publisher.
//
// Every failure becomes a typed status (`unavailable` with a reason), never an
// invented source or check date.

import { isPublicHttpUrl } from '../../../_shared/ssrf.ts';
import type {
  GuidanceResult,
  GuidanceSource,
  GuidanceUnavailableReason,
  Jurisdiction,
} from './contract.ts';
import type { CanadianProvince } from '../province.ts';

const OPENROUTER_ENDPOINT = 'https://openrouter.ai/api/v1/chat/completions';

export const MAX_RESULTS = 3;
const MAX_QUERY_CHARS = 300;
const MAX_REDIRECTS = 3;
const MAX_PAGE_BYTES = 600_000;
const EVIDENCE_CHARS = 1200;
const SEARCH_TIMEOUT_MS = 8000;
const READ_TIMEOUT_MS = 5000;

interface PublisherEntry {
  /** Registrable domain; subdomains match too. */
  domain: string;
  publisher: string;
  jurisdiction: Jurisdiction;
}

/** Official publishers by domain. The only place a source's publisher comes from. */
export const OFFICIAL_PUBLISHERS: readonly PublisherEntry[] = [
  { domain: 'canada.ca', publisher: 'Government of Canada', jurisdiction: 'federal' },
  { domain: 'gc.ca', publisher: 'Government of Canada', jurisdiction: 'federal' },
  { domain: 'gov.bc.ca', publisher: 'Government of British Columbia', jurisdiction: 'British Columbia' },
  { domain: 'ontario.ca', publisher: 'Government of Ontario', jurisdiction: 'Ontario' },
  { domain: 'quebec.ca', publisher: 'Gouvernement du Québec', jurisdiction: 'Quebec' },
  { domain: 'alberta.ca', publisher: 'Government of Alberta', jurisdiction: 'Alberta' },
  { domain: 'gov.mb.ca', publisher: 'Government of Manitoba', jurisdiction: 'Manitoba' },
  { domain: 'saskatchewan.ca', publisher: 'Government of Saskatchewan', jurisdiction: 'Saskatchewan' },
  { domain: 'novascotia.ca', publisher: 'Government of Nova Scotia', jurisdiction: 'Nova Scotia' },
  { domain: 'gnb.ca', publisher: 'Government of New Brunswick', jurisdiction: 'New Brunswick' },
  {
    domain: 'princeedwardisland.ca',
    publisher: 'Government of Prince Edward Island',
    jurisdiction: 'Prince Edward Island',
  },
  {
    domain: 'gov.nl.ca',
    publisher: 'Government of Newfoundland and Labrador',
    jurisdiction: 'Newfoundland and Labrador',
  },
  { domain: 'yukon.ca', publisher: 'Government of Yukon', jurisdiction: 'Yukon' },
  {
    domain: 'gov.nt.ca',
    publisher: 'Government of the Northwest Territories',
    jurisdiction: 'Northwest Territories',
  },
  { domain: 'gov.nu.ca', publisher: 'Government of Nunavut', jurisdiction: 'Nunavut' },
];

/** The registry entry for an https URL on a public official domain, else null. */
export function officialPublisher(rawUrl: string): PublisherEntry | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null;
  if (url.port && url.port !== '443') return null;
  if (!isPublicHttpUrl(url.href)) return null;
  const host = url.hostname.toLowerCase().replace(/\.$/, '');
  return (
    OFFICIAL_PUBLISHERS.find(entry => host === entry.domain || host.endsWith(`.${entry.domain}`)) ??
    null
  );
}

/** include_domains for the search engine: each domain and its subdomains. */
function searchDomains(): string[] {
  return OFFICIAL_PUBLISHERS.flatMap(entry => [entry.domain, `*.${entry.domain}`]);
}

export interface GuidanceConfig {
  /** COMPANION_GUIDANCE_SEARCH=off disables search (the answer says so). */
  enabled: boolean;
  apiKey: string | null;
  model: string;
}

export function guidanceConfigFromEnv(get: (key: string) => string | undefined): GuidanceConfig {
  const flag = (get('COMPANION_GUIDANCE_SEARCH') ?? '').trim().toLowerCase();
  return {
    enabled: flag !== 'off' && flag !== 'false' && flag !== '0',
    apiKey: get('OPENROUTER_API_KEY')?.trim() || null,
    model:
      get('OPENROUTER_GUIDANCE_MODEL')?.trim() ||
      get('OPENROUTER_MODEL_PRIMARY')?.trim() ||
      'deepseek/deepseek-v4.1-flash',
  };
}

const URL_IN_TEXT = /https:\/\/[^\s<>"'`()[\]{}]+/g;

function canonicalCandidate(raw: string): string | null {
  try {
    const url = new URL(raw.replace(/[.,;:!?]+$/, ''));
    url.hash = '';
    return url.href;
  } catch {
    return null;
  }
}

/**
 * Search for official pages. Returns candidate URLs on official domains, in
 * the order the engine gave them, at most MAX_RESULTS. The model only names
 * candidates: each one is re-validated here and then read by readOfficialPage.
 */
export async function searchOfficialPages(
  query: string,
  config: GuidanceConfig,
  signal: AbortSignal
): Promise<string[]> {
  const res = await fetch(OPENROUTER_ENDPOINT, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json',
      'X-Title': 'Unify - AI Companion guidance search',
    },
    body: JSON.stringify({
      model: config.model,
      messages: [
        {
          role: 'system',
          content:
            'Find current official Canadian government web pages that answer the question. Reply with the page URLs only, one per line, at most three. No other text.',
        },
        { role: 'user', content: query.slice(0, MAX_QUERY_CHARS) },
      ],
      plugins: [
        {
          id: 'web',
          engine: 'exa',
          max_results: MAX_RESULTS,
          include_domains: searchDomains(),
        },
      ],
      max_tokens: 200,
      temperature: 0,
      reasoning: { enabled: false },
    }),
    signal: AbortSignal.any([signal, AbortSignal.timeout(SEARCH_TIMEOUT_MS)]),
  });
  if (!res.ok) throw new Error(`search ${res.status}`);
  const body = (await res.json()) as {
    choices?: Array<{
      message?: {
        content?: unknown;
        annotations?: Array<{ type?: string; url_citation?: { url?: unknown } }>;
      };
    }>;
  };
  const message = body?.choices?.[0]?.message;
  const raw: string[] = [];
  for (const annotation of message?.annotations ?? []) {
    const url = annotation?.url_citation?.url;
    if (annotation?.type === 'url_citation' && typeof url === 'string') raw.push(url);
  }
  if (typeof message?.content === 'string') {
    raw.push(...(message.content.match(URL_IN_TEXT) ?? []));
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const candidate of raw) {
    const url = canonicalCandidate(candidate);
    if (!url || seen.has(url) || !officialPublisher(url)) continue;
    seen.add(url);
    out.push(url);
    if (out.length >= MAX_RESULTS) break;
  }
  return out;
}

export interface PageRead {
  url: string;
  title: string | null;
  evidence: string;
  checkedAt: string;
}

async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return '';
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > MAX_PAGE_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  const buffer = new Uint8Array(Math.min(total, MAX_PAGE_BYTES));
  let at = 0;
  for (const chunk of chunks) {
    buffer.set(chunk.subarray(0, buffer.length - at), at);
    at += chunk.byteLength;
    if (at >= buffer.length) break;
  }
  return new TextDecoder().decode(buffer);
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(text: string): string {
  return text.replace(/&(#x[0-9a-f]{1,6}|#\d{1,7}|[a-z]{2,6});/gi, (match, code: string) => {
    const lower = code.toLowerCase();
    if (lower.startsWith('#x')) return safeCodePoint(parseInt(lower.slice(2), 16), match);
    if (lower.startsWith('#')) return safeCodePoint(parseInt(lower.slice(1), 10), match);
    return ENTITIES[lower] ?? match;
  });
}

function safeCodePoint(code: number, fallback: string): string {
  try {
    return code > 31 && code < 0x110000 ? String.fromCodePoint(code) : ' ';
  } catch {
    return fallback;
  }
}

/** Visible text of an HTML page, with no markup, scripts or control characters. */
export function pageText(html: string): { title: string | null; text: string } {
  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const main = /<main[\s>][\s\S]*?<\/main>/i.exec(html)?.[0] ?? html;
  const strip = (fragment: string) =>
    decodeEntities(
      fragment
        .replace(/<!--[\s\S]*?-->/g, ' ')
        .replace(/<(script|style|noscript|svg|template|iframe|object)[\s\S]*?<\/\1\s*>/gi, ' ')
        .replace(/<[^>]*>/g, ' ')
    )
      .replace(/[\p{Cc}\p{Cf}]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  const title = titleMatch ? strip(titleMatch[1]).slice(0, 160) || null : null;
  return { title, text: strip(main) };
}

/**
 * GET one official page. Follows at most MAX_REDIRECTS redirects, each to an
 * official public https URL; anything else stops the read.
 */
export async function readOfficialPage(
  startUrl: string,
  signal: AbortSignal,
  now: () => Date
): Promise<PageRead> {
  let url = startUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (!officialPublisher(url)) throw new Error('not an official public URL');
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'manual',
      headers: { Accept: 'text/html, text/plain;q=0.8', 'User-Agent': 'UnifyCompanion/1.0' },
      signal: AbortSignal.any([signal, AbortSignal.timeout(READ_TIMEOUT_MS)]),
    });
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get('location');
      await res.body?.cancel();
      if (!location) throw new Error('redirect without location');
      url = new URL(location, url).href;
      continue;
    }
    if (res.status !== 200) {
      await res.body?.cancel();
      throw new Error(`read ${res.status}`);
    }
    const type = (res.headers.get('content-type') ?? '').toLowerCase();
    if (!type.includes('text/html') && !type.includes('text/plain')) {
      await res.body?.cancel();
      throw new Error('not a text page');
    }
    const body = await readCapped(res);
    const { title, text } = type.includes('text/html')
      ? pageText(body)
      : { title: null, text: body.replace(/[\p{Cc}\p{Cf}]/gu, ' ').replace(/\s+/g, ' ').trim() };
    if (!text) throw new Error('empty page');
    return { url, title, evidence: text.slice(0, EVIDENCE_CHARS), checkedAt: now().toISOString() };
  }
  throw new Error('too many redirects');
}

export interface GuidanceReads {
  result: GuidanceResult;
  /** Checked sources' text for the prompt, keyed by source id. */
  evidence: Map<string, string>;
  searchStatus: 'ok' | 'unavailable' | 'error' | 'skipped';
  readStatus: 'ok' | 'unavailable' | 'error' | 'skipped';
}

/**
 * Search, read and classify. `province` is the province this answer is about
 * (null when unknown). Sources for another province are kept visible but not
 * used; when only such sources were found, or sources disagree on the province
 * while it is unknown, the result is a conflict the answer must ask about.
 */
export async function gatherGuidance(
  query: string,
  province: CanadianProvince | null,
  config: GuidanceConfig,
  deps: { now: () => Date; signal?: AbortSignal }
): Promise<GuidanceReads> {
  const unavailable = (
    reason: GuidanceUnavailableReason,
    searchStatus: GuidanceReads['searchStatus'],
    readStatus: GuidanceReads['readStatus'],
    sources: GuidanceSource[] = []
  ): GuidanceReads => ({
    result: { status: 'unavailable', reason, sources },
    evidence: new Map(),
    searchStatus,
    readStatus,
  });

  if (!config.enabled) return unavailable('provider_disabled', 'skipped', 'skipped');
  if (!config.apiKey) return unavailable('provider_not_configured', 'skipped', 'skipped');

  const signal = deps.signal ?? new AbortController().signal;
  let candidates: string[];
  try {
    candidates = await searchOfficialPages(query, config, signal);
  } catch (error) {
    console.warn('[rag-query] guidance search failed', error instanceof Error ? error.message : 'unknown');
    return unavailable('search_failed', 'unavailable', 'skipped');
  }
  if (candidates.length === 0) return unavailable('no_official_results', 'ok', 'skipped');

  const reads = await Promise.allSettled(
    candidates.map(url => readOfficialPage(url, signal, deps.now))
  );

  const sources: GuidanceSource[] = [];
  const evidence = new Map<string, string>();
  reads.forEach((outcome, index) => {
    const id = `S${index + 1}`;
    const requested = candidates[index];
    if (outcome.status === 'rejected') {
      const entry = officialPublisher(requested)!;
      sources.push({
        id,
        url: requested,
        title: null,
        publisher: entry.publisher,
        jurisdiction: entry.jurisdiction,
        checkedAt: null,
        status: 'failed',
        reason: 'fetch_failed',
      });
      return;
    }
    const page = outcome.value;
    const entry = officialPublisher(page.url)!;
    const otherProvince =
      province !== null && entry.jurisdiction !== 'federal' && entry.jurisdiction !== province;
    sources.push({
      id,
      url: page.url,
      title: page.title,
      publisher: entry.publisher,
      jurisdiction: entry.jurisdiction,
      checkedAt: page.checkedAt,
      status: otherProvince ? 'excluded' : 'checked',
      ...(otherProvince ? { reason: 'different_province' as const } : {}),
    });
    if (!otherProvince) evidence.set(id, page.evidence);
  });

  const checked = sources.filter(source => source.status === 'checked');
  const excluded = sources.filter(source => source.status === 'excluded');
  const readStatus = checked.length + excluded.length > 0 ? 'ok' : 'unavailable';

  if (checked.length === 0 && excluded.length === 0) {
    return unavailable('read_failed', 'ok', 'unavailable', sources);
  }
  const provinces = new Set(
    checked.map(source => source.jurisdiction).filter(j => j !== 'federal')
  );
  const conflict =
    (checked.length === 0 && excluded.length > 0) || (province === null && provinces.size > 1);
  return {
    result: { status: conflict ? 'conflict' : 'checked', sources },
    evidence: conflict && checked.length === 0 ? new Map() : evidence,
    searchStatus: 'ok',
    readStatus,
  };
}
