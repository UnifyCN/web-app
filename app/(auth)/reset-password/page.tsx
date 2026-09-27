"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trans, useTranslation } from "react-i18next";
import { Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { OtpInput } from "@/components/auth/OtpInput";
import { FormError } from "@/components/auth/FormError";
import { Input } from "@/components/ui/Input";
import { EMAIL_RE, MIN_PASSWORD_LENGTH } from "@/lib/authValidation";
import { clearAuthEmail } from "@/lib/authEmailHandoff";
import {
  clearRecoveryPending,
  markRecoveryPending,
  readRecoveryPending,
} from "@/lib/recoveryPending";
import { useAuthEmail } from "@/hooks/useAuthEmail";
import {
  getAuthUser,
  sendPasswordReset,
  signOut,
  updatePassword,
  verifyRecoveryOtp,
} from "@/services/auth";

/**
 * Reset password — recovery code + new password on one screen (mobile parity).
 *
 * Two steps behind one button: verify the code (which signs the user in with a
 * recovery session and consumes the code), then save the new password. If the
 * save fails, the code step is done: the user stays here and retries the
 * password only. They leave only once the password is saved (or they cancel,
 * which signs them out) — see lib/recoveryPending.ts.
 */
function ResetPasswordScreen() {
  const router = useRouter();
  const { t } = useTranslation();
  // Handed over in sessionStorage by forgot-password. When it's missing (new
  // tab, other device, private window) the user types it instead.
  const { email: handedEmail, resolved } = useAuthEmail("reset");
  const [typedEmail, setTypedEmail] = useState("");
  const askForEmail = resolved && !handedEmail;
  const email = handedEmail || typedEmail.trim().toLowerCase();

  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // The code was rejected: show the error with a working "request a new one".
  const [codeRejected, setCodeRejected] = useState(false);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  // Code verified (recovery session live) but the new password isn't saved yet.
  const [codeVerified, setCodeVerified] = useState(false);

  // Resume after a reload mid-recovery: the proxy keeps the user here while the
  // marker matches their session. A stale marker (no matching session) is
  // dropped and the normal code step shows.
  useEffect(() => {
    const pending = readRecoveryPending();
    if (!pending) return;
    getAuthUser().then(({ user }) => {
      if (user?.id === pending) setCodeVerified(true);
      else clearRecoveryPending();
    });
  }, []);

  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const match = password === confirm;
  const passwordReady = passwordValid && confirm.length > 0 && match;
  const canSubmit = codeVerified
    ? passwordReady
    : EMAIL_RE.test(email) && code.length === 6 && passwordReady;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    setCodeRejected(false);
    setResent(false);

    if (!codeVerified) {
      const { userId, error: otpError } = await verifyRecoveryOtp(email, code);
      if (otpError) {
        setSubmitting(false);
        if (/expired|invalid|token/i.test(otpError.message)) {
          setCodeRejected(true);
        } else {
          setError(otpError.message || t("authWeb.couldntResetPassword"));
        }
        return;
      }
      // The code is spent now: from here on only the password can be retried.
      if (userId) markRecoveryPending(userId);
      setCodeVerified(true);
    }

    const { error: updateError } = await updatePassword(password);
    if (updateError) {
      setSubmitting(false);
      setError(updateError.message || t("authWeb.couldntResetPassword"));
      return;
    }

    // Send them to sign in with the new password (proxy bounces an authed user
    // off /login, so clear the recovery session first). If sign-out fails, the
    // recovery session would keep them authed — surface it instead of bouncing.
    clearRecoveryPending();
    clearAuthEmail("reset");
    const { error: signOutError } = await signOut();
    if (signOutError) {
      setSubmitting(false);
      setError(t("authWeb.resetSignOutFailed"));
      return;
    }
    router.replace("/login?reset=1");
  };

  // "Request a new one" on a rejected code: resend to the same address.
  const handleResend = async () => {
    if (resending || !EMAIL_RE.test(email)) return;
    setResending(true);
    setResent(false);
    const { error: resendError } = await sendPasswordReset(email);
    setResending(false);
    if (resendError) {
      setCodeRejected(false);
      setError(resendError.message || t("authWeb.couldntSendReset"));
      return;
    }
    setCodeRejected(false);
    setResent(true);
    setCode("");
  };

  // Abandon a verified recovery: sign out (clears the marker) and go to login.
  const handleCancel = async () => {
    await signOut();
    router.replace("/login");
  };

  return (
    <AuthShell backHref="/login">
      <h1 className="text-3xl font-bold text-ink">{t("auth.resetPassword")}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {codeVerified ? (
          t("authWeb.resetCodeVerified")
        ) : askForEmail ? (
          <>
            {t("auth.checkEmailCode")}.{" "}
            <Link
              href="/forgot-password"
              className="font-semibold text-mention-blue underline"
            >
              {t("authWeb.requestNewCode")}
            </Link>
          </>
        ) : (
          <Trans
            i18nKey="authWeb.resetEnterCode"
            values={{ email }}
            components={{
              email: <span className="font-semibold text-ink-secondary" />,
            }}
          />
        )}
      </p>

      <form onSubmit={handleSubmit} className="mt-8 space-y-5" noValidate>
        {!codeVerified && askForEmail && (
          <Input
            leftIcon={<Mail className="h-5 w-5" />}
            type="email"
            autoComplete="email"
            placeholder={t("auth.emailAddress")}
            value={typedEmail}
            onChange={(e) => {
              setTypedEmail(e.target.value);
              setError(null);
            }}
          />
        )}
        {!codeVerified && (
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
              setCodeRejected(false);
            }}
            autoFocus={!askForEmail}
            error={Boolean(error) || codeRejected}
          />
        )}
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
        {codeRejected && (
          <FormError>
            <Trans
              i18nKey="authWeb.codeInvalidRequestNew"
              components={{
                resend: (
                  <button
                    type="button"
                    onClick={handleResend}
                    disabled={resending}
                    className="font-semibold underline disabled:opacity-60"
                  />
                ),
              }}
            />
          </FormError>
        )}
        {resent && (
          <p className="text-sm text-emerald-600">
            {t("authWeb.newCodeOnWay")}
          </p>
        )}

        <AuthButton type="submit" loading={submitting} disabled={!canSubmit}>
          {t("auth.resetPassword")}
        </AuthButton>

        {codeVerified && (
          <button
            type="button"
            onClick={handleCancel}
            className="block w-full text-center text-sm text-ink-muted hover:text-ink"
          >
            {t("common.cancel")}
          </button>
        )}
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
