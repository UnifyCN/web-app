import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { validateImageFile } from "@/lib/supabase/imageStorage";

// Hard timeout for every outbound hop (S3 fetch + edge-function invoke) so a
// stuck transfer can't hang the route. Kept under Vercel's default function
// budget (~10-15s).
const STORAGE_TIMEOUT_MS = 10_000;

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

/** Distinguish our timeout (aborted fetch) from a genuine transport failure. */
function isAbortError(err: unknown): boolean {
  return err instanceof Error && err.name === "AbortError";
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

  // getSession() is a local cookie read (no network); the edge functions still
  // enforce JWT validation downstream, so this is a sufficient gate.
  const {
    data: { session },
    error: sessionError,
  } = await supabase.auth.getSession();
  if (sessionError) {
    console.error("/api/storage: getSession failed", sessionError);
  }
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const contentType = req.headers.get("content-type") ?? "";

  // ---- upload (multipart/form-data) ---------------------------------------
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
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

    const { data, error } = await supabase.functions.invoke<{
      uploadUrl: string;
      key: string;
    }>("profile-picture-upload", {
      body: { contentType: file.type },
      timeout: STORAGE_TIMEOUT_MS,
    });
    if (error || !data?.uploadUrl || !data?.key) {
      return NextResponse.json(
        { error: error?.message ?? "failed to sign upload" },
        { status: 502 },
      );
    }

    const fileBytes = await file.arrayBuffer();
    let put: Response;
    try {
      put = await fetchWithTimeout(data.uploadUrl, {
        method: "PUT",
        headers: { "Content-Type": file.type },
        body: fileBytes,
      });
    } catch (err) {
      if (isAbortError(err)) {
        return NextResponse.json(
          { error: "storage upload timed out" },
          { status: 504 },
        );
      }
      return NextResponse.json(
        { error: "storage upload failed" },
        { status: 502 },
      );
    }
    if (!put.ok) {
      return NextResponse.json(
        { error: `storage upload failed (${put.status})` },
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
  const { op, key } = body;
  if (!key || typeof key !== "string") {
    return NextResponse.json({ error: "missing key" }, { status: 400 });
  }

  if (op === "remove") {
    const { data, error } = await supabase.functions.invoke<{
      deleteUrl: string;
    }>("profile-picture-remove", { body: { key }, timeout: STORAGE_TIMEOUT_MS });
    if (error || !data?.deleteUrl) {
      return NextResponse.json(
        { error: error?.message ?? "failed to sign delete" },
        { status: 502 },
      );
    }
    let del: Response;
    try {
      del = await fetchWithTimeout(data.deleteUrl, { method: "DELETE" });
    } catch (err) {
      if (isAbortError(err)) {
        return NextResponse.json(
          { error: "storage delete timed out" },
          { status: 504 },
        );
      }
      return NextResponse.json(
        { error: "storage delete failed" },
        { status: 502 },
      );
    }
    if (!del.ok) {
      return NextResponse.json(
        { error: `storage delete failed (${del.status})` },
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
    return NextResponse.json(
      { error: error?.message ?? "failed to sign get" },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: data.url });
}
