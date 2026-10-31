"use client";

import { useTranslation } from "react-i18next";
import { useReaderProvince } from "@/hooks/useResourcePartners";
import { getMorePartnersNoteProvince } from "@/lib/resources/partners";

/**
 * One line above the partner lists telling a reader outside British Columbia
 * that more partners in their province are coming (as on mobile). Renders
 * nothing for BC readers or readers with no recognized province.
 */
export function MorePartnersNote() {
  const { t } = useTranslation();
  const province = getMorePartnersNoteProvince(useReaderProvince().province);
  if (!province) return null;
  return (
    <p className="text-[13px] leading-[18px] text-res-secondary">
      {t("resources.morePartnersComingSoon", { province })}
    </p>
  );
}
