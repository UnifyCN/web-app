"use client";

import { useTranslation } from "react-i18next";
import { ModalShell } from "@/components/ui/ModalShell";

const CRITERIA_KEYS = [
  "resources.howWeChoose.criteria.serves",
  "resources.howWeChoose.criteria.published",
  "resources.howWeChoose.criteria.eligibility",
  "resources.howWeChoose.criteria.reviewed",
] as const;

/** "How we choose these" explainer. Copy ported verbatim from mobile's sheet. */
export function HowWeChooseSheet({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      title={t("resources.howWeChoose.title")}
    >
      <p className="text-sm leading-relaxed text-res-body">
        {t("resources.howWeChoose.intro")}
      </p>
      <ul className="mt-3 space-y-2.5">
        {CRITERIA_KEYS.map((key) => (
          <li key={key} className="flex gap-2.5 text-sm leading-relaxed text-res-body">
            <span
              className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-res-link"
              aria-hidden
            />
            <span>{t(key)}</span>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs leading-relaxed text-res-secondary">
        {t("resources.howWeChoose.footnote")}
      </p>
    </ModalShell>
  );
}
