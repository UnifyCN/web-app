"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Trans, useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { OtpInput } from "@/components/auth/OtpInput";
import { FormError } from "@/components/auth/FormError";
import { Input } from "@/components/ui/Input";
import { MIN_PASSWORD_LENGTH } from "@/lib/authValidation";
import { resetPasswordWithOtp, signOut } from "@/services/auth";

/** Reset password — recovery code + new password on one screen (mobile parity). */
function ResetPasswordScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useTranslation();
  const email = params.get("email") ?? "";

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!email) {
    return (
      <AuthShell backHref="/forgot-password">
        <h1 className="text-3xl font-bold text-ink">{t("auth.resetPassword")}</h1>
        <p className="mt-2 text-sm text-ink-muted">
          {t("authWeb.resetMissingEmail")}{" "}
          <Link
            href="/forgot-password"
            className="font-semibold text-mention-blue underline"
          >
            {t("authWeb.requestNewCode")}
          </Link>
          .
        </p>
      </AuthShell>
    );
  }

  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const match = password === confirm;
  const canSubmit =
    code.length === 6 && passwordValid && confirm.length > 0 && match;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const { error: resetError } = await resetPasswordWithOtp(
      email,
      code,
      password,
    );
    if (resetError) {
      setSubmitting(false);
      setError(
        /expired|invalid|token/i.test(resetError.message)
          ? t("authWeb.codeInvalidRequestNew")
          : resetError.message || t("authWeb.couldntResetPassword"),
      );
      return;
    }
    // Send them to sign in with the new password (proxy bounces an authed user
    // off /login, so clear the recovery session first). If sign-out fails, the
    // recovery session would keep them authed — surface it instead of bouncing.
    const { error: signOutError } = await signOut();
    if (signOutError) {
      setSubmitting(false);
      setError(t("authWeb.resetSignOutFailed"));
      return;
    }
    router.replace("/login?reset=1");
  };

  return (
    <AuthShell backHref="/login">
      <h1 className="text-3xl font-bold text-ink">{t("auth.resetPassword")}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        <Trans
          i18nKey="authWeb.resetEnterCode"
          values={{ email }}
          components={{
            email: <span className="font-semibold text-ink-secondary" />,
          }}
        />
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
        <OtpInput
          value={code}
          onChange={(v) => {
            setCode(v);
            setError(null);
          }}
          autoFocus
          error={Boolean(error)}
        />
        <Input
          leftIcon={<Lock className="h-5 w-5" />}
          type="password"
          autoComplete="new-password"
          placeholder={t("auth.newPassword")}
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />
        <div>
          <Input
            leftIcon={<Lock className="h-5 w-5" />}
            type="password"
            autoComplete="new-password"
            placeholder={t("auth.confirmPassword")}
            value={confirm}
            error={confirm.length > 0 && !match}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
          />
          <FormError className="mt-1 text-xs">
            {confirm.length > 0 && !match ? t("auth.passwordsDoNotMatch") : null}
          </FormError>
        </div>

        <FormError>{error}</FormError>

        <AuthButton type="submit" loading={submitting} disabled={!canSubmit}>
          {t("auth.resetPassword")}
        </AuthButton>
      </form>
    </AuthShell>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordScreen />
    </Suspense>
  );
}
