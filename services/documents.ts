/**
 * Shared document-extraction client -- used by both the Resume Builder and the
 * Cover-Letter Generator import flows. POSTs a file as multipart/form-data to
 * the feature-neutral /api/documents/extract route (PDF via unpdf, DOCX via
 * mammoth) and maps HTTP errors to typed `DocumentImportError` codes.
 */

import {
  DocumentImportError,
  type DocumentImportErrorCode,
} from "@/lib/documents/errors";

/**
 * Upload a document and get back its extracted plain text. Throws a
 * `DocumentImportError` whose `code` the caller maps to a localized message.
 */
export async function extractDocumentText(
  file: File,
): Promise<{ text: string }> {
  const form = new FormData();
  form.append("file", file);

  let res: Response;
  try {
    res = await fetch("/api/documents/extract", { method: "POST", body: form });
  } catch {
    throw new DocumentImportError(
      "generic",
      "Upload failed. Check your connection and try again.",
    );
  }

  if (!res.ok) {
    let code: DocumentImportErrorCode | undefined;
    let message: string | undefined;
    try {
      const body = (await res.json()) as { code?: string; error?: string };
      code = body.code as DocumentImportErrorCode | undefined;
      message = body.error;
    } catch {
      // fall back to a status-based mapping below
    }
    if (!code) {
      if (res.status === 401) code = "unauthorized";
      else if (res.status === 413) code = "too_large";
      else if (res.status === 415) code = "unsupported_type";
      else if (res.status === 422) code = "unreadable";
      else code = "generic";
    }
    throw new DocumentImportError(code, message);
  }

  return (await res.json()) as { text: string };
}
