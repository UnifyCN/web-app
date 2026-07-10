"use client";

import { useTranslation } from "react-i18next";

/** "or" rule shown between the email form and the SSO buttons. */
export function OrDivider() {
  const { t } = useTranslation();
  return (
    <div className="my-6 flex items-center gap-4">
      <div className="h-px flex-1 bg-border-card" />
      <span className="text-sm text-ink-placeholder">{t("common.or")}</span>
      <div className="h-px flex-1 bg-border-card" />
    </div>
  );
}
