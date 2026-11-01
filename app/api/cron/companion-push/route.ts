import { handlePush } from "../../../../supabase/workers/companion-push/node-adapter.mjs";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180;

export async function GET(request: Request) {
  return handlePush(request, "cycle");
}

export const POST = GET;
