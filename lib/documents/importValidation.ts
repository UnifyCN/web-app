/**
 * Uploaded-document validation for the resume/cover-letter import flow — shared
 * by the client upload helper (services/resume.ts) and the server-side
 * `app/api/documents/extract` route. Deliberately dependency-free (no Supabase /
 * browser / Node imports) so both runtimes can import it.
 *
 * Mirrors lib/supabase/imageValidation.ts. The client checks the declared MIME /
 * extension for a fast pre-upload reject; the server additionally sniffs the
 * leading bytes (magic-byte verification) to catch a spoofed Content-Type.
 */

// 4MB — kept under Vercel's ~4.5MB serverless request-body cap so the limit the
// UI promises matches what the platform actually accepts. A resume PDF/DOCX is
// almost always well under 1MB, so this is comfortable headroom.
export const MAX_DOCUMENT_BYTES = 4 * 1024 * 1024; // 4MB

export const PDF_MIME = "application/pdf";
export const DOCX_MIME =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const ALLOWED_DOCUMENT_MIME_TYPES: readonly string[] = [
  PDF_MIME,
  DOCX_MIME,
];

/** Minimum trimmed characters of extracted text to treat the file as readable.
 *  Below this, the document is almost certainly a scanned/image-only PDF or an
 *  empty file — we tell the user rather than feeding the AI near-nothing. */
export const MIN_EXTRACTED_TEXT_CHARS = 100;

/** Upper bound on extracted text forwarded to the AI mapping turn — kept in
 *  lockstep with MAX_RESUME_IMPORT_LEN (lib/resume/schema.ts), which the proxy
 *  re-checks. The extract route slices to this so a very long resume still
 *  imports (truncated) instead of erroring. */
export const MAX_EXTRACTED_TEXT_CHARS = 20000;

// Single source of truth for the copy, derived from the limit so it can't drift.
export const DOCUMENT_TOO_LARGE_MESSAGE = `File is too large. Maximum size is ${
  MAX_DOCUMENT_BYTES / (1024 * 1024)
}MB.`;
export const UNSUPPORTED_DOCUMENT_MESSAGE =
  "Unsupported file type. Upload a PDF or DOCX.";

/** Which validateDocumentFile check failed — lets the caller map the cause to
 *  the right HTTP status (size → 413, type → 400/415). */
export type DocumentValidationReason = "type" | "size";

export class DocumentValidationError extends Error {
  constructor(
    message: string,
    readonly reason: DocumentValidationReason,
  ) {
    super(message);
    // Restore the prototype chain so `instanceof` holds even if downleveled.
    Object.setPrototypeOf(this, DocumentValidationError.prototype);
    this.name = "DocumentValidationError";
  }
}

export type DocumentKind = "pdf" | "docx";

/**
 * Resolve a file's document kind from its declared MIME OR filename extension.
 * Lenient by design (client pre-check): browsers set the DOCX MIME
 * inconsistently (sometimes empty or `application/zip`), so the extension is a
 * valid fallback. The server route still magic-byte-sniffs the real bytes.
 */
export function documentKindFromFile(file: File): DocumentKind | null {
  const name = file.name.toLowerCase();
  if (file.type === PDF_MIME || name.endsWith(".pdf")) return "pdf";
  if (file.type === DOCX_MIME || name.endsWith(".docx")) return "docx";
  return null;
}

/** Reject oversized / non-PDF-or-DOCX files before upload. Throws a
 *  DocumentValidationError whose `.message` callers can surface directly, and
 *  returns the resolved kind on success. */
export function validateDocumentFile(file: File): DocumentKind {
  const kind = documentKindFromFile(file);
  if (!kind) {
    throw new DocumentValidationError(UNSUPPORTED_DOCUMENT_MESSAGE, "type");
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    throw new DocumentValidationError(DOCUMENT_TOO_LARGE_MESSAGE, "size");
  }
  return kind;
}
