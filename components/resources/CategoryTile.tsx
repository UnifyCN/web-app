"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import {
  PARTNER_CATEGORY_ICON_TINTS,
  PARTNER_CATEGORY_LABEL_KEYS,
  categoryIconSrc,
} from "@/lib/resources/categories";
import type { PartnerCategory } from "@/types";

/** Category card on the Resources front page (Figma 8681:503 "Resource card"). */
export function CategoryTile({
  category,
  partnerCount,
}: {
  category: PartnerCategory;
  partnerCount: number;
}) {
  const { t } = useTranslation();

  return (
    <Link
      href={`/resources/category/${category}`}
      className="flex h-full flex-col items-start gap-[9px] rounded-[17px] border-[1.16px] border-res-border bg-surface p-[15px] text-start shadow-[0_1px_1px_rgba(30,25,15,0.04)] transition-[border-color,box-shadow] hover:border-res-outline hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-res-link focus-visible:ring-offset-2"
    >
      <span
        className="flex h-[37px] w-[37px] shrink-0 items-center justify-center rounded-[11.6px]"
        style={{ backgroundColor: PARTNER_CATEGORY_ICON_TINTS[category] }}
        aria-hidden
      >
        {/* eslint-disable-next-line @next/next/no-img-element -- tiny static SVG glyph */}
        <img src={categoryIconSrc(category)} alt="" width={23} height={23} />
      </span>
      <span className="min-h-[35px] text-base leading-[19.6px] font-bold break-words text-res-card-text">
        {t(PARTNER_CATEGORY_LABEL_KEYS[category])}
      </span>
      <span className="text-sm font-medium text-res-count">
        {t("resources.orgCount", { count: partnerCount })}
      </span>
    </Link>
  );
}
