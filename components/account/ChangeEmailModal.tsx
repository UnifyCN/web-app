"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Mail } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Input } from "@/components/ui/Input";
import { AuthButton } from "@/components/auth/AuthButton";
import { FormError } from "@/components/auth/FormError";
import { useRequestEmailChange } from "@/hooks/useAccount";
import { EMAIL_RE } from "@/lib/authValidation";

/**
 * Change email from Settings → Account. Supabase emails a confirmation link to
 * the new address; the change completes only when the user clicks that link
 * (handled by the /auth/callback route, which lands back on /settings). There's
 * no in-app code entry — just the request, then confirmation copy.
 */
export function ChangeEmailModal({
  open,
  onClose,
  currentEmail,
}: {
  open: boolean;
  onClose: () => void;
  currentEmail?: string;
}) {
  const { t } = useTranslation();
  const request = useRequestEmailChange();
  const [step, setStep] = useState<"email" | "sent">("email");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setStep("email");
    setEmail("");
    setError(null);
    request.reset();
    onClose();
  };

  const handleRequest = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError(t("settingsWeb.emailInvalid"));
      return;
    }
    if (currentEmail && normalized === currentEmail.toLowerCase()) {
      setError(t("settingsWeb.emailSame"));
      return;
    }
    setError(null);
    request.mutate(normalized, {
      onSuccess: () => setStep("sent"),
      onError: (err) =>
        setError(
          err instanceof Error
            ? err.message
            : t("settingsWeb.emailChangeFailed"),
        ),
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={request.isPending}
      title={t("settingsWeb.changeEmail")}
      description={
        step === "email" ? t("settingsWeb.emailChangeDesc") : undefined
      }
    >
      {step === "email" ? (
        <form onSubmit={handleRequest} className="space-y-3" noValidate>
          <Input
            leftIcon={<Mail className="h-5 w-5" />}
            type="email"
            autoComplete="email"
            placeholder={t("settingsWeb.newEmailPlaceholder")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
          <FormError className="text-xs">{error}</FormError>
          <div className="space-y-2 pt-2">
            <AuthButton
              type="submit"
              loading={request.isPending}
              disabled={!EMAIL_RE.test(email.trim())}
            >
              {t("common.submit")}
            </AuthButton>
            <button
              type="button"
              onClick={close}
              disabled={request.isPending}
              className="w-full cursor-pointer rounded-full py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
            >
              {t("common.cancel")}
            </button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-bg">
            <Mail className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <p className="text-sm text-ink-muted">
            {t("settingsWeb.emailChangeSentBody")}
          </p>
          <AuthButton type="button" onClick={close}>
            {t("common.done")}
          </AuthButton>
        </div>
      )}
    </ModalShell>
  );
}
