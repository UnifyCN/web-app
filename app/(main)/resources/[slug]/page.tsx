"use client";

import { use } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { getPartnerBySlug } from "@/lib/resources/partners";
import { PartnerDetail } from "@/components/resources/PartnerDetail";

export default function PartnerDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { t } = useTranslation();
  const { slug } = use(params);
  const partner = getPartnerBySlug(slug);

  if (!partner || !partner.active) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">{t("resources.notFound")}</p>
        <Link
          href="/resources"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {t("resources.backToCategories")}
        </Link>
      </div>
    );
  }

  return <PartnerDetail partner={partner} />;
}
