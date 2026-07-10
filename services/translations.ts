import { isSupabaseConfigured } from "@/lib/supabase/client";
import type { SupportedLanguage } from "@/lib/i18n/config";

/**
 * On-demand translation of user-generated content (posts + comments) into the
 * viewer's UI language — i18n Phase 2.
 *
 * Calls the web-owned `translate-content` edge function through the
 * same-origin `/api/translate` proxy (same CORS pattern as /api/companion and
 * /api/moderation; the proxy forwards the user's JWT from cookies). The
 * function caches translations server-side (post_translations /
 * comment_translations) and enforces a 20/day per-user quota — cache hits are
 * free and flagged with `cached: true`.
 */

export interface TranslationResult {
  translatedContent: string;
  /** Posts only — null when the model returned no title translation. */
  translatedTitle?: string | null;
  /** Detected ISO 639-1 source language, when the model reported one. */
  sourceLang?: string;
  /** True when served from the server-side cache (no quota consumed). */
  cached: boolean;
}

/** Thrown on the 429 daily-limit response so UI can message it distinctly. */
export class TranslationLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TranslationLimitError";
  }
}

async function requestTranslation(
  type: "post" | "comment",
  id: number,
  targetLanguage: SupportedLanguage,
): Promise<TranslationResult> {
  if (!isSupabaseConfigured()) {
    // Mock fallback for local dev without Supabase env vars, matching the
    // other services: return a deterministic fake translation instead of
    // hard-failing so the Translate UI stays usable.
    return {
      translatedContent: `[${targetLanguage}] Mock translation of ${type} #${id}`,
      translatedTitle:
        type === "post" ? `[${targetLanguage}] Mock translated title` : null,
      sourceLang: "en",
      cached: false,
    };
  }

  const res = await fetch("/api/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, id, targetLanguage }),
  });

  const body = (await res.json().catch(() => null)) as
    | (Partial<TranslationResult> & { error?: string; code?: string })
    | null;

  if (!res.ok) {
    const message = body?.error || "Couldn't translate. Try again.";
    if (res.status === 429 || body?.code === "daily_limit_reached") {
      throw new TranslationLimitError(message);
    }
    throw new Error(message);
  }
  if (!body || typeof body.translatedContent !== "string") {
    throw new Error("Couldn't translate. Try again.");
  }

  return {
    translatedContent: body.translatedContent,
    translatedTitle: body.translatedTitle ?? null,
    sourceLang: typeof body.sourceLang === "string" ? body.sourceLang : undefined,
    cached: Boolean(body.cached),
  };
}

export function translatePost(
  postId: number,
  targetLang: SupportedLanguage,
): Promise<TranslationResult> {
  return requestTranslation("post", postId, targetLang);
}

export function translateComment(
  commentId: number,
  targetLang: SupportedLanguage,
): Promise<TranslationResult> {
  return requestTranslation("comment", commentId, targetLang);
}
