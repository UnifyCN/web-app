"use client";

import { useTranslation } from "react-i18next";
import {
  dirForLanguage,
  isSupportedLanguage,
  type Direction,
} from "@/lib/i18n/config";

/**
 * Current UI text direction, derived reactively from the active i18n language.
 *
 * For the handful of cases that CSS logical properties + `rtl:` variants can't
 * express — JS geometry (e.g. DropdownMenu positioning) and keyboard Left/Right
 * semantics (e.g. ImageLightbox) — read direction here rather than from
 * `document.documentElement.dir` so the value is reactive (re-renders when the
 * user switches language) and identical on SSR + first client render (the i18n
 * instance is seeded with the server-resolved locale, so no hydration mismatch).
 */
export function useDirection(): Direction {
  const { i18n } = useTranslation();
  return isSupportedLanguage(i18n.language)
    ? dirForLanguage(i18n.language)
    : "ltr";
}

/** Convenience boolean for the common `direction === "rtl"` branch. */
export function useIsRtl(): boolean {
  return useDirection() === "rtl";
}
