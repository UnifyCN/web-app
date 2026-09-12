/**
 * Shared personalization helpers for the draft-backed document features (Resume
 * Builder, Cover Letter Generator). Both build the same per-turn profile context
 * from the cached current user and the active UI language.
 *
 * `ResumeProfileContext` and `CoverLetterProfileContext` are structurally identical,
 * so one builder serves both; the shared shape is aliased as `DraftProfileContext`.
 */

import {
  DEFAULT_LANGUAGE,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/i18n/config";
import type { UserProfile } from "@/types";
import type { ResumeProfileContext } from "@/types/resume";

/** Shared profile-context shape (ResumeProfileContext ≡ CoverLetterProfileContext). */
export type DraftProfileContext = ResumeProfileContext;

export function resolveLanguage(lang: string): SupportedLanguage {
  return isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE;
}

export function nowIso(): string {
  return new Date().toISOString();
}

/** Build the per-turn personalization context from the cached current user. */
export function buildProfile(
  user: UserProfile | undefined,
  language: string,
): DraftProfileContext {
  const onb = user?.onboarding ?? null;
  return {
    firstName: onb?.firstName ?? null,
    persona: onb?.persona ?? null,
    stage: onb?.stage ?? null,
    city: onb?.city ?? null,
    province: onb?.province ?? null,
    email: null,
    responseLanguage: resolveLanguage(language),
  };
}
