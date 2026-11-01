import { handlePush } from "../../../../supabase/workers/companion-push/node-adapter.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  return handlePush(request, "readiness");
}
