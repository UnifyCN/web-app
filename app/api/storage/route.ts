import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
  const contentType = req.headers.get("content-type") ?? "";

  // ---- upload (multipart/form-data) ---------------------------------------
  if (contentType.includes("multipart/form-data")) {
    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "missing file" }, { status: 400 });
    }
    const { data, error } = await supabase.functions.invoke<{
      uploadUrl: string;
      key: string;
    }>("profile-picture-upload", { body: { contentType: file.type } });
    if (error || !data?.uploadUrl || !data?.key) {
      return NextResponse.json(
        { error: error?.message ?? "failed to sign upload" },
        { status: 502 },
      );
    }
    const put = await fetch(data.uploadUrl, {
      method: "PUT",
      headers: { "Content-Type": file.type },
      body: await file.arrayBuffer(),
    });
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
    }>("profile-picture-remove", { body: { key } });
    if (error || !data?.deleteUrl) {
      return NextResponse.json(
        { error: error?.message ?? "failed to sign delete" },
        { status: 502 },
      );
    }
    const del = await fetch(data.deleteUrl, { method: "DELETE" });
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
    { body: { key } },
  );
  if (error || !data?.url) {
    return NextResponse.json(
      { error: error?.message ?? "failed to sign get" },
      { status: 502 },
    );
  }
  return NextResponse.json({ url: data.url });
}
