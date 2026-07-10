"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Check } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { OtpInput } from "@/components/auth/OtpInput";
import { FormError } from "@/components/auth/FormError";
import { resendSignupOtp, verifySignupOtp } from "@/services/auth";
import {
  clearSignupConsentCookie,
  readSignupConsentCookie,
} from "@/lib/authValidation";
import { trackSignUpCompleted } from "@/lib/analytics";

/** "Verify your email" — enter the 6-digit signup code (image 10). */
function VerifyEmailScreen() {
  const router = useRouter();
  const params = useSearchParams();
  const reduce = useReducedMotion();
  const { t } = useTranslation();
  const email = params.get("email") ?? "";

  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [resending, setResending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resent, setResent] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleVerify = async (token?: string) => {
    // Take the token directly from OtpInput.onComplete (the just-typed code) so
    // auto-submit never fires with a one-render-stale `code` state.
    const otp = token ?? code;
    if (!email) {
      setError(t("authWeb.missingEmailContext"));
      return;
    }
    if (otp.length !== 6 || verifying) return;
    setVerifying(true);
    setError(null);
    const { error: verifyError } = await verifySignupOtp(
      email,
      otp,
      readSignupConsentCookie(),
    );
    if (verifyError) {
      setVerifying(false);
      setError(
        /expired|invalid|token/i.test(verifyError.message)
          ? t("authWeb.codeInvalidResend")
          : verifyError.message || t("authWeb.couldntVerify"),
      );
      return;
    }
    clearSignupConsentCookie();
    trackSignUpCompleted();
    // Brief success beat before routing into the app.
    setSuccess(true);
    window.setTimeout(() => router.replace("/home"), reduce ? 400 : 800);
  };

  const handleResend = async () => {
    if (resending) return;
    setResending(true);
    setError(null);
    setResent(false);
    const { error: resendError } = await resendSignupOtp(email);
    setResending(false);
    if (resendError) {
      setError(resendError.message || t("authWeb.couldntResend"));
      return;
    }
    setResent(true);
    setCode("");
  };

  return (
    <AuthShell>
      <h1 className="text-3xl font-bold text-ink">{t("auth.otp.title")}</h1>

        {success ? (
          <div className="mt-8 flex flex-col items-center text-center">
          <motion.div
            initial={reduce ? { opacity: 0 } : { scale: 0.5, opacity: 0 }}
            animate={reduce ? { opacity: 1 } : { scale: 1, opacity: 1 }}
            transition={
              reduce
                ? { duration: 0.15 }
                : { type: "spring", stiffness: 320, damping: 18 }
            }
            className="flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500 text-white"
          >
            <Check className="h-10 w-10" strokeWidth={3} aria-hidden />
          </motion.div>
          <p className="mt-5 text-base font-semibold text-ink-secondary">
            {t("authWeb.emailVerified")}
          </p>
          <p className="mt-1 text-sm text-ink-muted">
            {t("authWeb.takingYouToAccount")}
          </p>
        </div>
      ) : (
        <>
          <p className="mt-6 text-center text-base text-ink-muted">
            {t("auth.otp.sentCodeTo")}
            <br />
            <span className="font-semibold text-ink-secondary">
              {email || t("authWeb.yourEmail")}
            </span>
          </p>

          <div className="mt-8">
            <OtpInput
              value={code}
              onChange={(v) => {
                setCode(v);
                setError(null);
              }}
              onComplete={handleVerify}
              autoFocus
              disabled={verifying}
              error={Boolean(error)}
            />
          </div>

          <div className="mt-4 text-center">
            <FormError className="text-center">{error}</FormError>
            <AnimatePresence initial={false}>
              {resent && !error && (
                <motion.p
                  key="resent"
                  initial={reduce ? { opacity: 0 } : { opacity: 0, y: -6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.15 }}
                  className="text-sm text-emerald-600"
                >
                  {t("authWeb.newCodeOnWay")}
                </motion.p>
              )}
            </AnimatePresence>
          </div>

          <div className="mt-8 flex justify-center">
            <AuthButton
              onClick={() => handleVerify()}
              loading={verifying}
              disabled={code.length !== 6}
              className="w-auto px-16"
            >
              {t("auth.otp.verifyButton")}
            </AuthButton>
          </div>

          <p className="mt-6 text-center text-sm text-ink-muted">
            {t("auth.otp.didntReceive")}
            <button
              type="button"
              onClick={handleResend}
              disabled={resending}
              className="font-semibold text-mention-blue hover:underline disabled:opacity-60"
            >
              {t("auth.otp.resend")}
            </button>
          </p>

          <Link
            href="/signup"
            className="group mt-6 flex items-center justify-center gap-2 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <ArrowLeft
              className="h-4 w-4 transition-transform group-hover:-translate-x-0.5 motion-reduce:transform-none"
              aria-hidden
            />
            {t("auth.otp.backToSignUp")}
          </Link>
        </>
      )}
    </AuthShell>
  );
}

export default function VerifyEmailPage() {
  return (
    <Suspense>
      <VerifyEmailScreen />
    </Suspense>
  );
}
