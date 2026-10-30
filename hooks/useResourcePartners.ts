"use client";

import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  getActiveResourcePartners,
  getPartnerBySlug,
  toResourcePartner,
  type ResourcePartner,
} from "@/lib/resources/partners";
import { useCurrentUser } from "@/hooks/useProfile";
import { isVisibleForProvince, resolveUserProvince } from "@/lib/province";

/** The reader's stored profile province (any format), and whether it is still
 * loading. Resources only lists partners for that province plus national ones. */
export function useReaderProvince(): {
  province: string | null;
  isPending: boolean;
} {
  const { data, isPending } = useCurrentUser();
  return { province: data?.onboarding?.province ?? null, isPending };
}

/** English-bound `t` — stable filter keys and analytics values in any language. */
function useEnglishT() {
  const { i18n } = useTranslation();
  return useMemo(() => i18n.getFixedT("en"), [i18n]);
}

/** Active Resources partners for the reader's province, with copy in the
 * current language. */
export function useResourcePartners(): ResourcePartner[] {
  const { t } = useTranslation();
  const enT = useEnglishT();
  const { province } = useReaderProvince();
  return useMemo(
    () => getActiveResourcePartners(t, enT, province),
    [t, enT, province],
  );
}

/**
 * One partner (any active state) with copy in the current language. A partner
 * for another province is not found, even by direct link (as on mobile).
 * `pending` is true while the profile loads for a province-tagged partner,
 * when it is neither shown nor reported missing.
 */
export function useResourcePartner(slug: string): {
  partner: ResourcePartner | undefined;
  pending: boolean;
} {
  const { t } = useTranslation();
  const enT = useEnglishT();
  const { province, isPending } = useReaderProvince();
  return useMemo(() => {
    const found = getPartnerBySlug(slug);
    const pending = isPending && !!found && (found.provinces?.length ?? 0) > 0;
    const visible =
      !!found &&
      !pending &&
      isVisibleForProvince(found.provinces, resolveUserProvince(province));
    return {
      partner: visible ? toResourcePartner(found, t, enT) : undefined,
      pending,
    };
  }, [slug, t, enT, province, isPending]);
}
