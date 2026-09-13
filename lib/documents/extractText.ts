/**
 * Server-only text extraction from uploaded resume documents. Imported ONLY by
 * the Node-runtime route `app/api/documents/extract` — `unpdf` and `mammoth` are
 * loaded via dynamic import so they stay out of every other bundle and only load
 * when someone actually imports a file.
 *
 *  - PDF  → `unpdf` (serverless-native; bundles pdfjs, no native deps / worker).
 *  - DOCX → `mammoth.extractRawText` (pure-JS; uses jszip under the hood).
 *
 * Both return plain text; structure mapping into ResumeData happens downstream
 * in the resume-chat edge function. `docx` (the export library) is NOT used here
 * — it has no read API.
 */
import {
  DocumentValidationError,
  DOCUMENT_TOO_LARGE_MESSAGE,
  type DocumentKind,
} from "@/lib/documents/importValidation";

// A 4MB ZIP can declare gigabytes of uncompressed content; mammoth/JSZip would
// decompress it all into memory (a zip-bomb DoS). Bound the total uncompressed
// size + entry count by reading the ZIP central directory (no decompression)
// before handing the bytes to mammoth. 100MB / 512 entries is far above any real
// resume DOCX yet well below what would exhaust the function's memory.
const MAX_DOCX_UNCOMPRESSED_BYTES = 100 * 1024 * 1024;
const MAX_DOCX_ENTRIES = 512;

/**
 * Reject DOCX archives whose declared uncompressed size or entry count exceeds
 * safe bounds, parsing only the ZIP End-of-Central-Directory + central directory
 * records (no inflation). Silently returns for anything that isn't a recognizable
 * ZIP — mammoth then surfaces the real parse error as "unreadable".
 */
function assertDocxWithinBounds(bytes: Uint8Array): void {
  const n = bytes.byteLength;
  const EOCD_MIN = 22;
  if (n < EOCD_MIN) return;
  const view = new DataView(bytes.buffer, bytes.byteOffset, n);
  const tooLarge = () =>
    new DocumentValidationError(DOCUMENT_TOO_LARGE_MESSAGE, "size");

  // Locate the End of Central Directory record (0x06054b50), scanning back over
  // the max 64KB trailing comment.
  let eocd = -1;
  const scanStart = Math.max(0, n - (EOCD_MIN + 0xffff));
  for (let i = n - EOCD_MIN; i >= scanStart; i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) return;

  const entryCount = view.getUint16(eocd + 10, true);
  if (entryCount > MAX_DOCX_ENTRIES) throw tooLarge();

  let p = view.getUint32(eocd + 16, true); // central directory offset
  let total = 0;
  for (let e = 0; e < entryCount; e++) {
    // Central directory file header signature 0x02014b50. Bail on anything
    // unexpected (truncated / ZIP64 layout) and let mammoth handle it.
    if (p + 46 > n || view.getUint32(p, true) !== 0x02014b50) break;
    const uncompressed = view.getUint32(p + 24, true);
    // 0xFFFFFFFF means the real size lives in a ZIP64 extra field; a legitimate
    // resume DOCX never needs that, so treat it as over-limit.
    if (uncompressed === 0xffffffff) throw tooLarge();
    total += uncompressed;
    if (total > MAX_DOCX_UNCOMPRESSED_BYTES) throw tooLarge();
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    p += 46 + nameLen + extraLen + commentLen;
  }
}

/** Collapse carriage returns and runs of blank lines, but keep single newlines —
 *  they preserve the line/section structure the AI mapping relies on. */
function normalizeWhitespace(input: string): string {
  return input
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function extractTextFromPdf(bytes: Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import("unpdf");
  const pdf = await getDocumentProxy(bytes);
  const { text } = await extractText(pdf, { mergePages: true });
  // mergePages:true yields a single string; guard the array shape defensively.
  const joined = Array.isArray(text) ? text.join("\n") : text;
  return normalizeWhitespace(joined ?? "");
}

async function extractTextFromDocx(bytes: Uint8Array): Promise<string> {
  // Guard against zip-bombs before mammoth decompresses anything.
  assertDocxWithinBounds(bytes);
  // mammoth is CommonJS — normalize the interop shape across bundlers.
  const mod = (await import("mammoth")) as unknown as {
    extractRawText?: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    default?: {
      extractRawText: (opts: { buffer: Buffer }) => Promise<{ value: string }>;
    };
  };
  const extractRawText = mod.extractRawText ?? mod.default?.extractRawText;
  if (!extractRawText) throw new Error("mammoth.extractRawText unavailable");
  const { value } = await extractRawText({ buffer: Buffer.from(bytes) });
  return normalizeWhitespace(value ?? "");
}

/** Extract plain text from an uploaded document's raw bytes. */
export async function extractDocumentText(
  bytes: Uint8Array,
  kind: DocumentKind,
): Promise<string> {
  return kind === "pdf"
    ? extractTextFromPdf(bytes)
    : extractTextFromDocx(bytes);
}
