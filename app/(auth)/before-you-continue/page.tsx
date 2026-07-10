"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { LegalConsentLabel } from "@/components/auth/LegalConsentLabel";
import { FormError } from "@/components/auth/FormError";
import { acceptLegalConsent, signOut } from "@/services/auth";

/**
 * Legal-consent gate (image 12). The proxy routes any authenticated user who
 * hasn't accepted the policies here — primarily OAuth users, who never saw the
 * signup checkbox.
 */
export default function BeforeYouContinuePage() {
  const router = useRouter();
  const { t } = useTranslation();
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleContinue = async () => {
    if (!agreed || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: consentError } = await acceptLegalConsent();
    if (consentError) {
      console.error("acceptLegalConsent failed", consentError);
      setSubmitting(false);
      setError(t("authWeb.couldntSaveConsent"));
      return;
    }
    router.replace("/home");
  };

  const handleCancel = async () => {
    if (submitting || cancelling) return;
    setCancelling(true);
    await signOut();
    router.replace("/welcome");
  };

  return (
    <AuthShell>
      <h1 className="text-3xl font-bold text-ink">
        {t("auth.legal.beforeContinue")}
      </h1>
      <p className="mt-2 text-base text-ink-muted">
        {t("auth.legal.reviewPolicies")}
      </p>

      <label className="mt-8 flex cursor-pointer items-start gap-3">
        <input
          type="checkbox"
          checked={agreed}
          onChange={(e) => setAgreed(e.target.checked)}
          className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
        />
        <span className="text-sm leading-snug text-ink-muted">
          <LegalConsentLabel oxford />
        </span>
      </label>

      <FormError className="mt-4">{error}</FormError>

      <div className="mt-auto space-y-3 pt-10">
        <AuthButton
          onClick={handleContinue}
          loading={submitting}
          disabled={!agreed || cancelling}
        >
          {t("common.continue")}
        </AuthButton>
        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting || cancelling}
          className="w-full py-2 text-center text-sm font-medium text-ink-muted transition-colors hover:text-ink disabled:opacity-60"
        >
          {t("common.cancel")}
        </button>
      </div>
    </AuthShell>
  );
}
