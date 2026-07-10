"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";
import { Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { OrDivider } from "@/components/auth/OrDivider";
import { FormError } from "@/components/auth/FormError";
import { useStagger } from "@/components/auth/motion";
import { Input } from "@/components/ui/Input";
import { LEGAL_URLS } from "@/lib/legalUrls";
import { EMAIL_RE } from "@/lib/authValidation";
import { getAuthUser, signInWithEmail } from "@/services/auth";
import { trackSignInCompleted, trackSignInFailed } from "@/lib/analytics";

/** Sign in — email + password alongside Google SSO (image 9). */
function LoginScreen() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { container, item } = useStagger();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const oauthError =
    searchParams.get("error") === "auth"
      ? t("auth.signInGenericError")
      : null;
  const resetDone = searchParams.get("reset") === "1";

  useEffect(() => {
    const redirectIfSignedIn = async (hard: boolean) => {
      const { user } = await getAuthUser();
      if (user) {
        if (hard) window.location.assign("/home");
        else router.replace("/home");
      }
    };
    redirectIfSignedIn(false);
    const onPageShow = (event: PageTransitionEvent) => {
      if (event.persisted) redirectIfSignedIn(true);
    };
    window.addEventListener("pageshow", onPageShow);
    return () => window.removeEventListener("pageshow", onPageShow);
  }, [router]);

  const canSubmit = EMAIL_RE.test(email.trim()) && password.length > 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const normalized = email.trim().toLowerCase();
    const { error: signInError } = await signInWithEmail(normalized, password);
    if (signInError) {
      setSubmitting(false);
      trackSignInFailed();
      if (/email not confirmed/i.test(signInError.message)) {
        router.push(`/verify-email?email=${encodeURIComponent(normalized)}`);
        return;
      }
      setError(
        /invalid login credentials/i.test(signInError.message)
          ? t("authWeb.incorrectCredentials")
          : signInError.message || t("authWeb.couldntSignIn"),
      );
      return;
    }
    trackSignInCompleted();
    router.replace("/home");
  };

  const errorMsg = error ?? oauthError;

  return (
    <AuthShell backHref="/welcome?step=4">
      <h1 className="text-3xl font-bold text-ink">{t("auth.signIn")}</h1>
      <p className="mt-1 text-sm text-ink-muted">
        {t("auth.newUser")}
        <Link href="/signup" className="font-semibold text-ink">
          {t("auth.createAnAccount")}
        </Link>
      </p>

      {resetDone && (
        <p className="mt-4 rounded-lg bg-primary-bg px-3 py-2 text-sm text-ink-secondary">
          {t("authWeb.passwordUpdatedSignIn")}
        </p>
      )}

      <motion.form
        {...container}
        onSubmit={handleSubmit}
        className="mt-8 space-y-4"
        noValidate
      >
        <motion.div {...item}>
          <Input
            leftIcon={<Mail className="h-5 w-5" />}
            type="email"
            autoComplete="email"
            placeholder={t("auth.emailAddress")}
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
        </motion.div>
        <motion.div {...item}>
          <Input
            leftIcon={<Lock className="h-5 w-5" />}
            type="password"
            autoComplete="current-password"
            placeholder={t("auth.password")}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
        </motion.div>
        <motion.div {...item} className="flex justify-end">
          <Link
            href="/forgot-password"
            className="text-sm font-medium text-mention-blue hover:underline"
          >
            {t("auth.forgotPassword")}
          </Link>
        </motion.div>

        <motion.div {...item} className="space-y-3">
          <FormError>{errorMsg}</FormError>
          <AuthButton type="submit" loading={submitting} disabled={!canSubmit}>
            {t("auth.login")}
          </AuthButton>
        </motion.div>
      </motion.form>

      <OrDivider />
      <OAuthButtons onError={(m) => setError(m || null)} />

      <p className="mt-8 text-center text-xs leading-relaxed text-ink-placeholder">
        <Trans
          i18nKey="auth.legalSignIn"
          components={{
            terms: (
              <a
                href={LEGAL_URLS.termsOfService}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink-muted underline"
              />
            ),
            privacy: (
              <a
                href={LEGAL_URLS.privacyPolicy}
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-ink-muted underline"
              />
            ),
          }}
        />
      </p>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginScreen />
    </Suspense>
  );
}
