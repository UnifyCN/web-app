// Dependency-free text helpers shared by every adapter. Source bodies are arbitrary
// third-party HTML, so these are deliberately defensive.

import { MAX_DESCRIPTION_CHARS } from './constants.ts';

/**
 * `String.fromCodePoint` throws RangeError for anything outside 0…0x10FFFF — a feed
 * carrying `&#99999999;` or `&#x7FFFFFFF;` is enough. That throw would escape
 * decodeEntities() through clean()/htmlToParagraphs() and the row mapper into the
 * adapter's catch, which returns [] — so ONE malformed entity in ONE item would discard
 * that source's whole batch. Out-of-range values therefore keep their literal source
 * text (`raw`) rather than throwing or being silently dropped.
 */
function codePointOr(raw: string, n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw;
}

export function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#0*160;/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&#8211;/g, '–')
    .replace(/&#8212;/g, '—')
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => codePointOr(m, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePointOr(m, parseInt(n, 16)));
}

/** Decode entities, collapse whitespace, trim. For single-line fields (title, venue). */
export function clean(value: unknown): string {
  if (value === null || value === undefined || value === '') return '';
  return decodeEntities(String(value)).replace(/\s+/g, ' ').trim();
}

/**
 * Convert an HTML fragment to plain text that PRESERVES paragraph breaks as `\n` (the
 * event detail page splits description on `\n` to render paragraphs). Block-ish tags
 * become newlines; remaining tags are stripped; entities decoded; runs of blank lines
 * collapsed. Source bodies (esp. MOSAIC's Cvent form markup and BiblioCommons'
 * accessibility boilerplate) carry heavy nesting, so we normalise aggressively.
 */
export function htmlToParagraphs(html: string | null | undefined): string {
  if (!html) return '';
  const withBreaks = String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, '\n')
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|blockquote)\s*>/gi, '\n')
    .replace(/<[^>]*>/g, ' ');
  return decodeEntities(withBreaks)
    .split('\n')
    .map((line) => line.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, MAX_DESCRIPTION_CHARS);
}

// Venue names that denote a virtual room rather than a physical place. Sources that lack
// a virtual flag (Tribe's `is_virtual` ships with a paid add-on) mark online events by
// registering a venue literally named "Online" or "Webinar", so the venue NAME is often
// the only signal — without this every webinar types as in-person.
const VIRTUAL_STRONG = new Set([
  'online', 'virtual', 'webinar', 'zoom', 'remote', 'teleconference', 'livestream',
  'webex', 'teams', 'meet',
]);
const VIRTUAL_FILLER = new Set([
  'event', 'events', 'meeting', 'session', 'workshop', 'only', 'platform', 'via', 'web',
  'google', 'ms', 'microsoft', 'stream', 'live',
]);

/**
 * True when the whole venue name is virtual vocabulary ("Online", "Webinar",
 * "Online (Zoom)", "Virtual Event"). Matches the ENTIRE name rather than searching for a
 * substring, so a physical venue that merely contains one of these words — "Online
 * Learning Centre, 123 Main St" — is not misread as virtual.
 */
export function isOnlineVenueName(name: string): boolean {
  const tokens = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (tokens.length === 0) return false;
  if (!tokens.every((t) => VIRTUAL_STRONG.has(t) || VIRTUAL_FILLER.has(t))) return false;
  return tokens.some((t) => VIRTUAL_STRONG.has(t));
}
