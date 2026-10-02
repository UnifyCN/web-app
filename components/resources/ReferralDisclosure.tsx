"use client";

import { useTranslation } from "react-i18next";
import { Info } from "lucide-react";
import { cn } from "@/lib/utils";

/** "Unify may earn a referral fee…" line shown on a referral partner's listings. */
export function ReferralDisclosure({ className }: { className?: string }) {
  const { t } = useTranslation();
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-snug text-res-secondary", className)}>
      <Info className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>{t("resources.referralDisclosure")}</span>
    </p>
  );
}
