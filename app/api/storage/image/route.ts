import { NextResponse, type NextRequest } from "next/server";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { parseImageRequest } from "@/lib/supabase/imageUrl";

// sharp is a Node dependency; this route must never run on the Edge runtime.
export const runtime = "nodejs";
export const maxDuration = 15;

const SIGN_TIMEOUT_MS = 6_000;
const FETCH_TIMEOUT_MS = 8_000;
// Refuse to buffer anything far beyond what the upload paths accept.
const MAX_SOURCE_BYTES = 20 * 1024 * 1024;
// Caps decode memory: a 50-megapixel source is already larger than any phone photo.
const MAX_SOURCE_PIXELS = 50_000_000;

// Keys are immutable (a new upload gets a new key), so a given key + width can
// be cached for good. `private`: the response depends on the caller's session.
const CACHE_CONTROL = "private, max-age=31536000, immutable";

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
 * Access is unchanged: the signed URL comes from `profile-picture-get`, invoked
 * with the caller's session, and that function verifies the JWT itself. No
 * valid session, no signed URL, no image. Output is always re-encoded, so the
 * route never relays the stored bytes as-is.
 */
export async function GET(req: NextRequest) {
  const request = parseImageRequest(req.nextUrl.searchParams);
  if (!request) {
    return NextResponse.json({ error: "Invalid image request" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  const { data, error } = await supabase.functions.invoke<{ url: string }>(
    "profile-picture-get",
    { body: { key: request.key }, timeout: SIGN_TIMEOUT_MS },
  );
  if (error || !data?.url) {
    if (error) console.error("/api/storage/image: sign failed", error);
    return NextResponse.json({ error: "Image not available" }, { status: 404 });
  }

  let source: ArrayBuffer;
  try {
    const upstream = await fetch(data.url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
    if (!upstream.ok) {
      console.error("/api/storage/image: S3 status", upstream.status);
      return NextResponse.json({ error: "Image not available" }, { status: 404 });
    }
    const declared = Number(upstream.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
    source = await upstream.arrayBuffer();
    if (source.byteLength > MAX_SOURCE_BYTES) {
      return NextResponse.json({ error: "Image too large" }, { status: 413 });
    }
  } catch (err) {
    console.error("/api/storage/image: fetch failed", err);
    return NextResponse.json({ error: "Image request failed" }, { status: 502 });
  }

  let output: Buffer;
  try {
    output = await sharp(source, { limitInputPixels: MAX_SOURCE_PIXELS })
      .rotate() // apply EXIF orientation before it is stripped
      .resize({ width: request.width, withoutEnlargement: true })
      .webp({ quality: 78 })
      .toBuffer();
  } catch (err) {
    console.error("/api/storage/image: resize failed", err);
    return NextResponse.json({ error: "Unsupported image" }, { status: 415 });
  }

  return new NextResponse(new Uint8Array(output), {
    status: 200,
    headers: {
      "Content-Type": "image/webp",
      "Content-Length": String(output.byteLength),
      "Cache-Control": CACHE_CONTROL,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
