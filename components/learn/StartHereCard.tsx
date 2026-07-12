import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Blob } from "./Blob";

interface StartHereCardProps {
  moduleId: string;
  moduleTitle: string;
  /** Personalized reason (whyTag); falls back to a neutral nudge. */
  reason?: string;
  colorHex: string;
}

/**
 * First-time nudge shown on the Learn page when the user has no progress yet —
 * points them at the single most relevant module for their profile instead of a
 * blank grid.
 */
export function StartHereCard({
  moduleId,
  moduleTitle,
  reason,
  colorHex,
}: StartHereCardProps) {
  const { t } = useTranslation();
  return (
    <Link
      href={`/learn/${moduleId}`}
      className="group relative block overflow-hidden rounded-card p-6 text-white shadow-sm transition-transform duration-200 hover:-translate-y-0.5"
      style={{ backgroundColor: colorHex }}
    >
      <Blob
        color="#ffffff"
        opacity={0.22}
        className="absolute -right-12 -top-16 h-64 w-64"
      />
      <div className="relative">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-white/20 px-2.5 py-1 text-xs font-semibold">
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t("learnWeb.home.startHere")}
        </span>
        <p className="mt-3 text-sm text-white/90">
          {reason ?? t("learnWeb.home.startHereReason")}
        </p>
        <h2 className="mt-1 text-2xl font-extrabold leading-tight">
          {moduleTitle}
        </h2>
        <span
          className="mt-4 inline-flex h-10 items-center gap-1.5 rounded-md bg-white px-4 text-sm font-semibold"
          style={{ color: colorHex }}
        >
          {t("learnWeb.home.startLearning")}
          <ArrowRight className="h-4 w-4" aria-hidden />
        </span>
      </div>
    </Link>
  );
}
