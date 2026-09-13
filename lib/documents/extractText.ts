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
import type { DocumentKind } from "@/lib/documents/importValidation";

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
