import { NextResponse, type NextRequest } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { fileTypeFromBuffer } from "file-type";
import sharp from "sharp";
import { parseImageRequest } from "@/lib/supabase/imageUrl";
import {
  PRIVATE_IMAGE_CACHE_CONTROL,
  SHARED_IMAGE_CACHE_CONTROL,
} from "@/lib/supabase/imageCacheControl";
import { ALLOWED_IMAGE_MIME_TYPES } from "@/lib/supabase/imageValidation";
import { isTrustedStorageUrl } from "@/lib/supabase/storageHost";

// sharp is a Node dependency; this route must never run on the Edge runtime.
export const runtime = "nodejs";
export const maxDuration = 15;

const SIGN_TIMEOUT_MS = 6_000;
const FETCH_TIMEOUT_MS = 8_000;
const RESIZE_TIMEOUT_SECONDS = 5;
// Uploads are capped at 4MB; this leaves room for larger photos from the
// native app while refusing to buffer anything far beyond that.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
// Caps decode memory: a 50-megapixel source is already larger than any phone photo.
const MAX_SOURCE_PIXELS = 50_000_000;

// Keys are immutable (a new upload gets a new key) and the bytes depend only on
// the key and width, never on who asked, so a result can be cached for good.
//
// Browser only, for now: every browser still pays for the signing and resize
// once per picture. Caching at the CDN as well (the shared value) would
// make that a one-time cost for everyone, but it is only safe if `proxy.ts`
// still turns away signed-out requests that the CDN could answer from its
// cache. `./probe/route.ts` exists to prove that on production before any real
// picture is shared; flip SHARE_AT_EDGE only after that check has passed.
const SHARE_AT_EDGE = false;

// Errors are never cached, so a transient failure cannot stick.
const fail = (error: string, status: number) =>
  NextResponse.json(
    { error },
    { status, headers: { "Cache-Control": "no-store" } },
  );

/**
 * Reads a response body up to `limit` bytes. Returns null as soon as the body
 * turns out to be larger, so an oversized or mislabelled object is never fully
 * buffered, whatever its Content-Length header claimed.
 */
async function readCapped(
  response: Response,
  limit: number,
): Promise<Uint8Array | null> {
  const reader = response.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

/**
 * GET /api/storage/image?key=<object key>&w=<width>
 *
 * Serves a stored image resized to `w` pixels wide, at a URL that never changes
 * for that key and width. The storage edge function only hands out signed URLs
 * that expire after 60 seconds and point at the full-size original; rendering
 * those directly meant re-downloading every image at full resolution about once
 * a minute. This route does the signing server-side, resizes with sharp, and
 * lets the browser cache the result.
 *
 * What it will and will not do:
 * - The caller never supplies a URL. They supply a key, which must be a user's
 *   picture (`users/<uuid>/<file>.<jpg|png|webp>`), and one of a fixed list of
 *   widths; anything else is a 400. Keep that shape check strict: it is what
 *   limits this route to pictures.
 * - Only signed-in people get an image. `proxy.ts` verifies the session on
 *   every request, and the signed URL comes from `profile-picture-get`,
 *   invoked with the caller's session (its gateway verifies the JWT again).
 * - The server only fetches from the one storage host, over https, for exactly
 *   the key requested, and does not follow redirects.
 * - The bytes must really be a JPEG, PNG or WebP (checked by content, not by
 *   name), within the size, pixel and time limits above. Output is always
 *   re-encoded as WebP, so the stored bytes are never relayed as-is.
 */
export async function GET(req: NextRequest) {
  const request = parseImageRequest(req.nextUrl.searchParams);
  if (!request) return fail("Invalid image request", 400);

  // Same client as lib/supabase/server.ts, except that it records whether the
  // session had to be refreshed here (which writes cookies). The proxy normally
  // does that before this runs; if it ever happens here, the response must
  // stay out of any shared cache.
  const cookieStore = await cookies();
  let wroteCookies = false;
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? "",
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll(cookiesToSet) {
          wroteCookies = true;
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        },
      },
    },
  );
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return fail("Not signed in", 401);

  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    "profile-picture-get",
    { body: { key: request.key }, timeout: SIGN_TIMEOUT_MS },
  );
  if (error || !data?.url) {
    if (error) console.error("/api/storage/image: sign failed", error);
    return fail("Image not available", 404);
  }
  if (!isTrustedStorageUrl(data.url, request.key)) {
    // Never log the URL itself: its query string carries the signature.
    console.error("/api/storage/image: signed URL is not on the storage host");
    return fail("Image request failed", 502);
  }

  let source: Uint8Array | null;
  try {
    const upstream = await fetch(data.url, {
      // A redirect could lead anywhere; the storage host never needs one.
      redirect: "error",
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      console.error("/api/storage/image: S3 status", upstream.status);
      return fail("Image not available", 404);
    }
    const declared = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
      await upstream.body?.cancel();
      return fail("Image too large", 413);
    }
    source = await readCapped(upstream, MAX_SOURCE_BYTES);
  } catch (err) {
    console.error("/api/storage/image: fetch failed", err);
    return fail("Image request failed", 502);
  }
  if (!source) {
    return fail("Image too large", 413);
  }

  // By content, not by file name: only the formats uploads accept get decoded.
  const sniffed = await fileTypeFromBuffer(source);
  if (!sniffed || !ALLOWED_IMAGE_MIME_TYPES.includes(sniffed.mime)) {
    return fail("Unsupported image", 415);
  }

  let output: Buffer;
  try {
    output = await sharp(source, { limitInputPixels: MAX_SOURCE_PIXELS })
      .timeout({ seconds: RESIZE_TIMEOUT_SECONDS })
      .rotate() // apply EXIF orientation before it is stripped
      .resize({ width: request.width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (err) {
    console.error("/api/storage/image: resize failed", err);
    return fail("Unsupported image", 415);
  }

  return new NextResponse(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(output.byteLength),
      "Cache-Control":
        // A response that had to write a session cookie is never shared.
        SHARE_AT_EDGE && !wroteCookies
          ? SHARED_IMAGE_CACHE_CONTROL
          : PRIVATE_IMAGE_CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
