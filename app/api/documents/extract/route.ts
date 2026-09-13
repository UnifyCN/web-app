import { NextResponse, type NextRequest } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { createClient } from "@/lib/supabase/server";
import { extractDocumentText } from "@/lib/documents/extractText";
import {
  MAX_DOCUMENT_BYTES,
  MAX_EXTRACTED_TEXT_CHARS,
  MIN_EXTRACTED_TEXT_CHARS,
  DOCUMENT_TOO_LARGE_MESSAGE,
  UNSUPPORTED_DOCUMENT_MESSAGE,
  DocumentValidationError,
  PDF_MIME,
  DOCX_MIME,
  type DocumentKind,
} from "@/lib/documents/importValidation";

// Node runtime: `file-type` (byte sniffing) and the `unpdf`/`mammoth` parsers are
// Node-targeted and must never run on Edge. Mirrors app/api/storage/route.ts.
export const runtime = "nodejs";
// PDF/DOCX parsing is CPU-bound but small; 15s is ample for a 4MB file.
export const maxDuration = 15;

// Allowance for multipart/form-data framing (boundaries + part headers) that
// inflates Content-Length beyond the file's own bytes (mirrors the storage route).
const MAX_MULTIPART_OVERHEAD_BYTES = 8 * 1024;

/**
 * Resolve the document kind from the SNIFFED bytes (authoritative), not the
 * client-declared type. file-type reports a real .docx as the OOXML mime, but
 * occasionally only as a bare zip — accept that only when the filename also ends
 * in .docx (mammoth then fails gracefully if it isn't really a Word doc).
 */
function kindFromSniff(
  sniffedMime: string | undefined,
  filename: string,
): DocumentKind | null {
  if (sniffedMime === PDF_MIME) return "pdf";
  if (sniffedMime === DOCX_MIME) return "docx";
  if (sniffedMime === "application/zip" && filename.toLowerCase().endsWith(".docx")) {
    return "docx";
  }
  return null;
}

/**
 * Extract plain text from an uploaded resume (PDF or DOCX). Feature-neutral: the
 * resume import flow (and, as a fast-follow, cover-letter import) POSTs the file
 * here as multipart/form-data (field "file") and gets back `{ text }`. The AI
 * mapping into structured data happens downstream via the resume-chat edge fn —
 * no OpenRouter call here (and no key on Vercel anyway).
 *
 * Error bodies carry a `code` the client maps to a localized message:
 *   415 { code:"unsupported_type" } | 413 { code:"too_large" } |
 *   422 { code:"unreadable" } | 411 | 401 | 400.
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return NextResponse.json(
      { error: "Expected multipart/form-data" },
      { status: 400 },
    );
  }

  // Require a sane Content-Length and reject oversized bodies before buffering.
  // A missing / chunked / non-numeric header yields Number(null) === 0, which
  // would slip past the size check and then be fully buffered — so reject those
  // outright (411). The exact per-file cap is re-checked after parsing.
  const declaredLength = Number(req.headers.get("content-length"));
  if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
    return NextResponse.json(
      { error: "A valid Content-Length header is required." },
      { status: 411 },
    );
  }
  if (declaredLength > MAX_DOCUMENT_BYTES + MAX_MULTIPART_OVERHEAD_BYTES) {
    return NextResponse.json(
      { error: DOCUMENT_TOO_LARGE_MESSAGE, code: "too_large" },
      { status: 413 },
    );
  }

  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Missing file" }, { status: 400 });
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return NextResponse.json(
      { error: DOCUMENT_TOO_LARGE_MESSAGE, code: "too_large" },
      { status: 413 },
    );
  }

  // Magic-byte verification: the client-declared type is spoofable. Read the
  // bytes once, sniff the real leading bytes, and use the DETECTED kind for
  // extraction (never the client's claim).
  const fileBytes = await file.arrayBuffer();
  const bytes = new Uint8Array(fileBytes);
  const sniffed = await fileTypeFromBuffer(bytes);
  const kind = kindFromSniff(sniffed?.mime, file.name);
  if (!kind) {
    return NextResponse.json(
      { error: UNSUPPORTED_DOCUMENT_MESSAGE, code: "unsupported_type" },
      { status: 415 },
    );
  }

  let text: string;
  try {
    text = await extractDocumentText(bytes, kind);
  } catch (err) {
    // A zip-bomb / oversized DOCX archive is a size rejection, not "unreadable".
    if (err instanceof DocumentValidationError && err.reason === "size") {
      return NextResponse.json(
        { error: DOCUMENT_TOO_LARGE_MESSAGE, code: "too_large" },
        { status: 413 },
      );
    }
    console.error("/api/documents/extract: parse failed", err);
    // A corrupt/undecodable file reads as unreadable rather than a 500.
    return NextResponse.json(
      {
        error: "We couldn't read text from this file.",
        code: "unreadable",
      },
      { status: 422 },
    );
  }

  // Confidence gate: too little text means a scanned/image-only PDF or an empty
  // document — tell the user instead of feeding the AI near-nothing.
  if (text.length < MIN_EXTRACTED_TEXT_CHARS) {
    return NextResponse.json(
      {
        error:
          "We couldn't read enough text from this file. Scanned images aren't supported — try a text-based PDF or DOCX.",
        code: "unreadable",
      },
      { status: 422 },
    );
  }

  // Bound the payload forwarded to the AI mapping turn (a very long resume still
  // imports, truncated, rather than erroring at the proxy's length gate).
  return NextResponse.json({ text: text.slice(0, MAX_EXTRACTED_TEXT_CHARS) });
}
