"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { ChevronRight, Languages, MapPin } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { PARTNER_CATEGORY_LABEL_KEYS } from "@/lib/resources/categories";
import type { ResourcePartner } from "@/lib/resources/partners";
import { CostChip } from "./CostChip";

const CHIP =
  "inline-flex items-center gap-1 rounded-full bg-res-search px-[9px] py-1 text-[11px] leading-none font-semibold text-res-secondary";

/** Organization row on a category / results list (Figma 8681:643 "resource card"). */
export function PartnerCard({
  partner,
  showCategory = false,
}: {
  partner: ResourcePartner;
  /** Cross-category results name the category under the org name. */
  showCategory?: boolean;
}) {
  const { t } = useTranslation();
  const languages = partner.languages ?? [];

  return (
    <Link
      href={`/resources/${partner.slug}`}
      className="group flex items-start gap-3 rounded-2xl border border-res-border bg-surface px-[15px] py-[14px] shadow-[0_1px_1px_rgba(30,25,15,0.04)] transition-[border-color,box-shadow] hover:border-res-outline hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-res-link focus-visible:ring-offset-2"
    >
      <div className="flex min-w-0 flex-1 flex-col gap-[5px]">
        <div className="flex flex-col gap-0.5">
          <p className="text-[15px] leading-snug font-extrabold break-words text-res-card-text">
            <bdi dir="auto">{partner.name}</bdi>
          </p>
          {showCategory && (
            <p className="text-xs font-semibold text-res-secondary">
              {t(PARTNER_CATEGORY_LABEL_KEYS[partner.category])}
            </p>
          )}
        </div>
        <p className="line-clamp-2 text-[13px] leading-[18.2px] text-res-secondary">
          <bdi dir="auto">{partner.tagline}</bdi>
        </p>
        <div className="flex flex-wrap gap-1.5 pt-0.5">
          <span className={CHIP}>
            <MapPin className="h-[13px] w-[13px] shrink-0" aria-hidden />
            <bdi dir="auto">{partner.serviceArea}</bdi>
          </span>
          {partner.cost && <CostChip cost={partner.cost} />}
          {partner.format !== "unknown" && (
            <span className={CHIP}>{t(`resources.format.${partner.format}`)}</span>
          )}
          {languages.length > 0 && (
            <span className={CHIP}>
              <Languages className="h-[13px] w-[13px] shrink-0" aria-hidden />
              {t("resources.detail.languageCount", { count: languages.length })}
            </span>
          )}
        </div>
      </div>
      <ChevronRight
        className={cn(
          "h-5 w-5 shrink-0 self-center text-res-chevron transition-colors group-hover:text-res-secondary",
          RTL_FLIP,
        )}
        aria-hidden
      />
    </Link>
  );
}
