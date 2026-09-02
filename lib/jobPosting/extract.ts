/**
 * Extract a job posting (title, company, location, text) from raw HTML.
 *
 * Two strategies, JSON-LD first because it's structured and clean:
 *   1. schema.org `JobPosting` embedded as `<script type="application/ld+json">`
 *      — LinkedIn, Indeed, Greenhouse, Lever, Workday and most ATS platforms
 *      embed it. Gives title / hiringOrganization.name / jobLocation / description.
 *   2. Fallback: drop non-content chrome (script/style/nav/header/footer/aside),
 *      prefer `<main>`/`<article>`, then strip tags + decode entities. Cheaper and
 *      noisier; the downstream LLM tolerates the noise.
 *
 * Deliberately dependency-free (the app ships no cheerio/jsdom) and defensive —
 * source HTML is arbitrary and hostile. This module intentionally imports nothing
 * so the standalone verification harness can load it in isolation.
 */

export interface ExtractedJobPosting {
  title: string;
  company: string;
  location: string;
  text: string;
}

/** Below this many characters of body text, treat extraction as failed (a login
 *  wall, a JS-only shell, or a blocked page — not a real posting). */
const MIN_CONTENT = 200;

/** Hard cap on extracted text (the schema layer caps again to MAX_JOB_POSTING_LEN). */
const MAX_TEXT = 8000;

/* ------------------------------------------------------------------ *
 * Entity decoding + tag stripping (mirrors events-crawler/lib/text.ts).
 * ------------------------------------------------------------------ */

function codePointOr(raw: string, n: number): string {
  return Number.isInteger(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : raw;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#0*39;/g, "'")
    .replace(/&#x0*27;/gi, "'")
    .replace(/&#0*160;/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&ndash;/g, "–")
    .replace(/&mdash;/g, "—")
    .replace(/&lsquo;|&rsquo;/g, "'")
    .replace(/&ldquo;|&rdquo;/g, '"')
    .replace(/&hellip;/g, "…")
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#8216;|&#8217;/g, "'")
    .replace(/&#8220;|&#8221;/g, '"')
    .replace(/&#(\d+);/g, (m, n) => codePointOr(m, Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (m, n) => codePointOr(m, parseInt(n, 16)));
}

/** HTML fragment → plain text, preserving block breaks as `\n`. */
function htmlToText(html: string): string {
  const withBreaks = String(html)
    .replace(/<\s*br\s*\/?\s*>/gi, "\n")
    .replace(/<\/\s*(p|div|li|ul|ol|h[1-6]|tr|section|article)\s*>/gi, "\n")
    .replace(/<[^>]*>/g, " ");
  return decodeEntities(withBreaks)
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join("\n");
}

/** Collapse arbitrary pasted/plain text (decode + trim lines). */
export function normalizeJobText(input: string): string {
  if (!input) return "";
  return decodeEntities(String(input))
    .split(/\r?\n/)
    .map((line) => line.replace(/[^\S\n]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
    .slice(0, MAX_TEXT);
}

/** Best-effort title from a block of plain text: first non-empty, title-ish line. */
export function extractTitleFromText(text: string): string {
  const first = text
    .split("\n")
    .map((l) => l.trim())
    .find(Boolean);
  if (!first) return "";
  return first.slice(0, 120);
}

/* ------------------------------------------------------------------ *
 * Strategy 1 — JSON-LD JobPosting.
 * ------------------------------------------------------------------ */

function isJobPostingType(type: unknown): boolean {
  return type === "JobPosting" || (Array.isArray(type) && type.includes("JobPosting"));
}

/** Recursively locate a schema.org JobPosting node (handles arrays + @graph). */
function findJobPostingNode(node: unknown, depth = 0): Record<string, unknown> | null {
  if (depth > 6 || node === null || typeof node !== "object") return null;
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findJobPostingNode(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  const obj = node as Record<string, unknown>;
  if (isJobPostingType(obj["@type"])) return obj;
  for (const value of Object.values(obj)) {
    if (value && typeof value === "object") {
      const found = findJobPostingNode(value, depth + 1);
      if (found) return found;
    }
  }
  return null;
}

function ldCompany(v: unknown): string {
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return ldCompany(v[0]);
  if (v && typeof v === "object") {
    const name = (v as Record<string, unknown>).name;
    if (typeof name === "string") return name;
  }
  return "";
}

function ldLocation(v: unknown): string {
  if (Array.isArray(v)) return ldLocation(v[0]);
  if (v && typeof v === "object") {
    const obj = v as Record<string, unknown>;
    const address = (obj.address ?? obj) as Record<string, unknown>;
    if (address && typeof address === "object") {
      const parts = [address.addressLocality, address.addressRegion, address.addressCountry]
        .map((p) => (typeof p === "string" ? p.trim() : ""))
        .filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
    if (typeof obj.name === "string") return obj.name;
  }
  return "";
}

function extractFromJsonLd(html: string): ExtractedJobPosting | null {
  const blocks = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  for (const block of blocks) {
    const raw = block[1]?.trim();
    if (!raw) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue; // a malformed block never sinks the whole extraction
    }
    const node = findJobPostingNode(parsed);
    if (!node) continue;
    const title = typeof node.title === "string" ? decodeEntities(node.title).trim() : "";
    const company = decodeEntities(ldCompany(node.hiringOrganization)).trim();
    const location = decodeEntities(ldLocation(node.jobLocation)).trim();
    const description =
      typeof node.description === "string" ? htmlToText(node.description) : "";
    return { title, company, location, text: description };
  }
  return null;
}

/* ------------------------------------------------------------------ *
 * Strategy 2 — chrome-stripped body text.
 * ------------------------------------------------------------------ */

function stripToText(html: string): string {
  let s = html
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<template\b[^>]*>[\s\S]*?<\/template>/gi, " ")
    .replace(/<svg\b[^>]*>[\s\S]*?<\/svg>/gi, " ")
    .replace(/<(nav|header|footer|aside)\b[^>]*>[\s\S]*?<\/\1>/gi, " ");
  // Prefer the main content region when the page marks one.
  const main =
    s.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i) ??
    s.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  if (main) s = main[1];
  return htmlToText(s);
}

function metaTitle(html: string): string {
  const og = html.match(
    /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
  );
  if (og) return decodeEntities(og[1]).replace(/\s+/g, " ").trim();
  const h1 = html.match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  if (h1) {
    const line = htmlToText(h1[1]).split("\n")[0];
    if (line) return line.slice(0, 200);
  }
  const t = html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (t) return decodeEntities(t[1]).replace(/\s+/g, " ").trim();
  return "";
}

/* ------------------------------------------------------------------ *
 * Public entry point.
 * ------------------------------------------------------------------ */

function cap(result: ExtractedJobPosting): ExtractedJobPosting {
  return {
    title: result.title.slice(0, 200),
    company: result.company.slice(0, 160),
    location: result.location.slice(0, 160),
    text: result.text.slice(0, MAX_TEXT),
  };
}

/**
 * A single job posting never titles itself as a jobs COUNT ("11,000+ … jobs") or
 * a board landing, and never leads with a LinkedIn-style login/alert wall. These
 * are what bot-blocking sites serve to an unauthenticated fetch instead of the
 * real posting — high-signal, low-false-positive markers so we fail loudly rather
 * than tailor a resume to junk. Only consulted on the fallback path (a real
 * schema.org JobPosting is trusted before we get here).
 */
const NON_POSTING_TITLE_RE =
  /(\b\d[\d,]{2,}\+?\s+[^\n]*?\bjobs?\b)|(\bcurrent openings\b)|(\bfind your next role\b)|(\bcareer['’]?s page\b)|(\bjobs? in\b.*\b(united states|canada|remote)\b)/i;

const WALL_MARKERS = [
  "sign in to create job alert",
  "get notified about new",
  "join now to see",
  "sign in to see who you know",
  "sign in to view",
];

function looksLikeNonPosting(title: string, text: string): boolean {
  if (title && NON_POSTING_TITLE_RE.test(title)) return true;
  const body = text.toLowerCase();
  return WALL_MARKERS.some((m) => body.includes(m));
}

/**
 * Extract a job posting from raw HTML. Returns null when the page yields no
 * usable content (login wall / JS-only shell / blocked) so the caller can emit a
 * clear "extraction failed" rather than a bad tailoring.
 */
export function extractJobPosting(html: string): ExtractedJobPosting | null {
  if (!html || typeof html !== "string") return null;

  const ld = extractFromJsonLd(html);
  if (ld && ld.text.trim().length >= MIN_CONTENT) return cap(ld);

  const bodyText = stripToText(html);
  const title = (ld?.title || metaTitle(html)).slice(0, 200);

  // Reject known non-posting shells (login walls, jobs-count listings, board
  // landings) that bot-blocking sites serve — better a clear failure (→ "paste
  // the description") than a resume tailored to junk.
  if (looksLikeNonPosting(title, bodyText)) {
    if (ld && ld.text.trim().length > 0) return cap(ld); // a real JobPosting node wins
    return null;
  }

  if (bodyText.trim().length < MIN_CONTENT) {
    // Not enough page text. If JSON-LD gave us a title/short description, keep it;
    // otherwise the extraction genuinely failed.
    if (ld && (ld.title || ld.text)) return cap(ld);
    return null;
  }

  return cap({
    title,
    company: ld?.company ?? "",
    location: ld?.location ?? "",
    text: bodyText,
  });
}
