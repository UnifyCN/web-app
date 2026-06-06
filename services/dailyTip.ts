import {
  createClient,
  getAuthUserId,
  isSupabaseConfigured,
} from "@/lib/supabase/client";
import { mockDailyTip } from "@/lib/mock/dailyTip";
import type { DailyTip, DailyTipSource } from "@/types";

interface RawDailyTip {
  id: string | number;
  category: string | null;
  title: string | null;
  description: string | null;
  tip_text: string | null;
  date: string | null;
  source_refs: { document_title?: string; url?: string }[] | null;
}

function normalizeSources(
  refs: RawDailyTip["source_refs"],
): DailyTipSource[] | null {
  if (!Array.isArray(refs)) return null;
  const out = refs
    .filter((r) => r && r.url && r.document_title)
    .map((r) => ({ documentTitle: r.document_title as string, url: r.url as string }));
  return out.length > 0 ? out : null;
}

function mapTip(raw: RawDailyTip): DailyTip {
  return {
    id: raw.id,
    category: raw.category ?? "general",
    title: raw.title ?? "",
    description: raw.description ?? "",
    tipText: raw.tip_text ?? "",
    date: raw.date ?? new Date().toISOString().split("T")[0],
    sources: normalizeSources(raw.source_refs),
  };
}

/**
 * The user's tip for today — generated/cached server-side per (user, date) by
 * the `get-daily-tip` edge function. Falls back to mock content when Supabase
 * isn't configured or there's no auth session (the local-dev path).
 */
export async function getDailyTip(): Promise<DailyTip> {
  if (!isSupabaseConfigured()) return mockDailyTip;
  const userId = await getAuthUserId();
  if (!userId) return mockDailyTip;

  const supabase = createClient();
  const { data, error } = await supabase.functions.invoke<{ tip: RawDailyTip }>(
    "get-daily-tip",
    { body: {} },
  );

  if (error) throw error;
  if (!data?.tip) throw new Error("get-daily-tip returned no tip");
  return mapTip(data.tip);
}
