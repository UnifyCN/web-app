"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  getActiveResourcePartners,
  getPartnerBySlug,
  toResourcePartner,
  type ResourcePartner,
} from "@/lib/resources/partners";

/** English-bound `t` — stable filter keys and analytics values in any language. */
function useEnglishT() {
  const { i18n } = useTranslation();
  return useMemo(() => i18n.getFixedT("en"), [i18n]);
}

/** Active Resources partners with copy in the current language. */
export function useResourcePartners(): ResourcePartner[] {
  const { t } = useTranslation();
  const enT = useEnglishT();
  return useMemo(() => getActiveResourcePartners(t, enT), [t, enT]);
}

/** One partner (any active state) with copy in the current language. */
export function useResourcePartner(slug: string): ResourcePartner | undefined {
  const { t } = useTranslation();
  const enT = useEnglishT();
  return useMemo(() => {
    const partner = getPartnerBySlug(slug);
    return partner ? toResourcePartner(partner, t, enT) : undefined;
  }, [slug, t, enT]);
}
