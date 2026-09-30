import { cookies } from "next/headers";
import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { LEARNING_DESTINATION_COOKIE, readLearningDestination } from "@/lib/learningDestination";
import { createClient } from "@/lib/supabase/server";

// Read-only acknowledgement for an actually mounted app page. The Proxy runs
// all existing auth/setup gates for this API too; it alone mutates the cookie.
export async function GET() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const headers = { "Cache-Control": "private, no-store" };
  if (!user) return NextResponse.json({ intent: null }, { status: 401, headers });
  const value = (await cookies()).get(LEARNING_DESTINATION_COOKIE)?.value;
  // Stable acknowledgement token only; never expose the section or cookie value.
  const intent = value && readLearningDestination(value)
    ? createHash("sha256").update(`${user.id}|${value}`).digest("hex") : null;
  return NextResponse.json({ intent }, { headers });
}
