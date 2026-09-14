/**
 * Typed error for the document-import flow. A single error carrying a `code`
 * (rather than a class per failure) keeps the service thin and lets the UI map
 * each code straight to a localized message.
 *
 * Codes:
 *  - unsupported_type  : not a PDF/DOCX (or bytes don't match the declared type)
 *  - too_large         : over MAX_DOCUMENT_BYTES
 *  - unreadable        : extracted text too short (scanned/image PDF, empty file)
 *  - not_a_resume      : AI mapping produced no substantive resume content
 *  - not_a_cover_letter: AI mapping produced no substantive cover letter content
 *  - daily_limit_reached : usage quota exhausted
 *  - busy              : AI service temporarily unavailable (503/504)
 *  - unauthorized      : no session
 *  - generic           : anything else
 */
export type DocumentImportErrorCode =
  | "unsupported_type"
  | "too_large"
  | "unreadable"
  | "not_a_resume"
  | "not_a_cover_letter"
  | "daily_limit_reached"
  | "busy"
  | "unauthorized"
  | "generic";

export class DocumentImportError extends Error {
  constructor(
    readonly code: DocumentImportErrorCode,
    message?: string,
  ) {
    super(message ?? code);
    Object.setPrototypeOf(this, DocumentImportError.prototype);
    this.name = "DocumentImportError";
  }
}
