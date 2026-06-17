import { NextResponse, type NextRequest } from "next/server";
import { fileTypeFromBuffer } from "file-type";
import { createClient } from "@/lib/supabase/server";
import {
  validateImageFile,
  MAX_IMAGE_BYTES,
  ALLOWED_IMAGE_MIME_TYPES,
} from "@/lib/supabase/imageValidation";

// Force the Node.js runtime: the upload branch sniffs file bytes with `file-type`
// (a Node-targeted dependency), and this route must never run on the Edge runtime.
export const runtime = "nodejs";

// Cap the whole handler so Vercel kills a truly-stuck request at 10s; the
// per-hop timeout below uses the same budget.
export const maxDuration = 10;

// Hard timeout for every outbound hop (S3 fetch + edge-function invoke) so a
// stuck transfer can't hang the route.
const STORAGE_TIMEOUT_MS = 10_000;

// A storage object's filename segment. Matching the remainder after
// `users/<uid>/` against this (which has no `/`) bounds the key to a single
// segment, so it can't reach another user's path via extra segments.
const STORAGE_FILENAME = /^[A-Za-z0-9._-]+$/;

/** fetch() with a hard timeout. On timeout the AbortController fires and fetch()
 *  rejects with an AbortError (see isAbortError). */
async function fetchWithTimeout(
  url: string,
  init: RequestInit,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STORAGE_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * True when an error is one of our timeouts rather than a real failure. Covers
 * both an aborted fetch (S3 PUT/DELETE — `err.name`) and an aborted
 * `functions.invoke`, which wraps the abort in a FunctionsFetchError whose
 * `context` is the original AbortError (`err.context.name`). Checks `name`
 * directly (no `instanceof Error`) so it holds across runtimes where a
 * DOMException isn't an Error subclass.
 */
function isAbortError(err: unknown): boolean {
  const e = err as { name?: string; context?: { name?: string } } | null;
  return e?.name === "AbortError" || e?.context?.name === "AbortError";
}

/**
 * Same-origin proxy for the shared (mobile) project's storage edge functions
 * (`profile-picture-get` / `-upload` / `-remove`). Those functions were built for
 * the native app and emit no CORS headers, so the browser can't call them
 * directly (`supabase.functions.invoke` → FunctionsFetchError on the preflight).
 *
 * Running the call server-side here sidesteps the edge-function CORS preflight
 * AND the browser→S3 CORS on the PUT/DELETE. Uses the server Supabase client so
 * the request carries the caller's session JWT.
 *
 *   POST (json) { op:"get", key }    -> { url }
 *   POST (json) { op:"remove", key } -> { ok: true }   (server-side S3 DELETE)
 *   POST (multipart, field "file")   -> { key }         (server-side S3 PUT)
 */
export async function POST(req: NextRequest) {
  const supabase = await createClient();

  // getUser() validates the JWT against the auth server. getSession() only
  // decodes the cookie (no signature check) and Supabase flags it as insecure
  // for server code, so it's not used here as the gate.
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError) {
    console.error("/api/storage: getUser failed", authError);
  }
  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  // ---- upload (multipart/form-data) ---------------------------------------
  if (contentType.includes("multipart/form-data")) {
    // Require a sane Content-Length and reject oversized bodies up front so we
    // never buffer a huge payload. A missing / chunked / non-numeric header
    // yields Number(null) === 0, which would otherwise slip past the size check
    // and then be fully buffered by req.formData() — so reject those outright
    // (411 Length Required) rather than trusting an absent length. The exact
    // per-file limit is still re-checked by validateImageFile after parsing.
    // Multipart framing adds a little overhead, so the cap is slightly conservative.
    const declaredLength = Number(req.headers.get("content-length"));
    if (!Number.isFinite(declaredLength) || declaredLength <= 0) {
      return NextResponse.json(
        { error: "A valid Content-Length header is required." },
        { status: 411 },
      );
    }
    if (declaredLength > MAX_IMAGE_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Maximum size is 4MB." },
        { status: 413 },
      );
    }
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Missing file" }, { status: 400 });
    }
    // Re-validate server-side: the client's validateImageFile is bypassable, so
    // don't trust the posted MIME type / size before signing or uploading.
    try {
      validateImageFile(file);
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Invalid file" },
        { status: 400 },
      );
    }

    // Magic-byte verification: validateImageFile only trusts the client-declared
    // MIME (file.type), which is trivially spoofable. Read the bytes once, sniff
    // the actual leading bytes, and reject anything whose real content isn't an
    // allowed image or contradicts the declared type. The same buffer is reused
    // for the S3 PUT below, so the body is never read twice. From here on we sign
    // and upload with the *detected* MIME, never the client-declared one.
    const fileBytes = await file.arrayBuffer();
    const sniffed = await fileTypeFromBuffer(new Uint8Array(fileBytes));
    if (!sniffed || !ALLOWED_IMAGE_MIME_TYPES.includes(sniffed.mime)) {
      return NextResponse.json(
        { error: "Unsupported file type. Use PNG, JPEG, WebP, or GIF." },
        { status: 400 },
      );
    }
    if (sniffed.mime !== file.type) {
      return NextResponse.json(
        { error: "File contents do not match the declared image type." },
        { status: 400 },
      );
    }
    const detectedMime = sniffed.mime;

    const { data, error } = await supabase.functions.invoke<{
      uploadUrl: string;
      key: string;
    }>("profile-picture-upload", {
      body: { contentType: detectedMime },
      timeout: STORAGE_TIMEOUT_MS,
    });
    if (error || !data?.uploadUrl || !data?.key) {
      if (error) console.error("/api/storage upload: sign failed", error);
      const timedOut = isAbortError(error);
      return NextResponse.json(
        { error: timedOut ? "Image upload timed out" : "Image upload failed" },
        { status: timedOut ? 504 : 502 },
      );
    }

    let put: Response;
    try {
      put = await fetchWithTimeout(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": detectedMime },
        body: fileBytes,
      });
    } catch (err) {
      console.error("/api/storage upload: S3 PUT failed", err);
      const timedOut = isAbortError(err);
      return NextResponse.json(
        { error: timedOut ? "Image upload timed out" : "Image upload failed" },
        { status: timedOut ? 504 : 502 },
      );
    }
    if (!put.ok) {
      console.error("/api/storage upload: S3 PUT status", put.status);
      return NextResponse.json(
        { error: "Image upload failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ key: data.key });
  }

  // ---- get / remove (json) ------------------------------------------------
  const body = (await req.json().catch(() => ({}))) as {
    op?: string;
    key?: string;
  };
  const op = body.op;
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) {
    return NextResponse.json({ error: "Invalid key" }, { status: 400 });
  }
  if (op !== "get" && op !== "remove") {
    return NextResponse.json({ error: "Invalid operation" }, { status: 400 });
  }

  if (op === "remove") {
    // Owner-only delete: the key must be `users/<own-uid>/<filename>` with a
    // single filename segment (no `/`), so a user can only delete their own
    // objects — never another user's, and never via extra path segments. (A
    // lone `..` filename is allowed by the charset but harmless: it stays within
    // the user's own prefix. `get` is intentionally cross-user — the feed
    // resolves other users' avatars and post images.)
    const ownPrefix = `users/${user.id}/`;
    if (
      !key.startsWith(ownPrefix) ||
      !STORAGE_FILENAME.test(key.slice(ownPrefix.length))
    ) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const { data, error } = await supabase.functions.invoke<{
      deleteUrl: string;
    }>("profile-picture-remove", { body: { key }, timeout: STORAGE_TIMEOUT_MS });
    if (error || !data?.deleteUrl) {
      if (error) console.error("/api/storage remove: sign failed", error);
      const timedOut = isAbortError(error);
      return NextResponse.json(
        { error: timedOut ? "Image delete timed out" : "Image delete failed" },
        { status: timedOut ? 504 : 502 },
      );
    }
    let del: Response;
    try {
      del = await fetchWithTimeout(data.deleteUrl, { method: "DELETE" });
    } catch (err) {
      console.error("/api/storage remove: S3 DELETE failed", err);
      const timedOut = isAbortError(err);
      return NextResponse.json(
        { error: timedOut ? "Image delete timed out" : "Image delete failed" },
        { status: timedOut ? 504 : 502 },
      );
    }
    if (!del.ok) {
      console.error("/api/storage remove: S3 DELETE status", del.status);
      return NextResponse.json(
        { error: "Image delete failed" },
        { status: 502 },
      );
    }
    return NextResponse.json({ ok: true });
  }

  // default: get a signed read URL
  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    "profile-picture-get",
    { body: { key }, timeout: STORAGE_TIMEOUT_MS },
  );
  if (error || !data?.url) {
    if (error) console.error("/api/storage get: sign failed", error);
    const timedOut = isAbortError(error);
    return NextResponse.json(
      { error: timedOut ? "Image request timed out" : "Image request failed" },
      { status: timedOut ? 504 : 502 },
    );
  }
  return NextResponse.json({ url: data.url });
}
