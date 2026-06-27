"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { Check, Lock, Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { OAuthButtons } from "@/components/auth/OAuthButtons";
import { OrDivider } from "@/components/auth/OrDivider";
import { LegalConsentLabel } from "@/components/auth/LegalConsentLabel";
import { FormError } from "@/components/auth/FormError";
import { PasswordStrengthBar } from "@/components/auth/PasswordStrengthBar";
import { useStagger } from "@/components/auth/motion";
import { Input } from "@/components/ui/Input";
import {
  EMAIL_RE,
  MIN_PASSWORD_LENGTH,
  setSignupConsentCookie,
} from "@/lib/authValidation";
import { isCommonPassword } from "@/lib/passwordStrength";
import { suggestEmailCorrection } from "@/lib/emailTypos";
import { signUpWithEmail } from "@/services/auth";
import { trackSignUpFailed, trackSignUpStarted } from "@/lib/analytics";

/** Create account — email + password with a required consent checkbox (image 8). */
export default function SignUpPage() {
  const router = useRouter();
  const { container, item } = useStagger();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [agreed, setAgreed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const emailValid = EMAIL_RE.test(email.trim());
  const passwordValid = password.length >= MIN_PASSWORD_LENGTH;
  const match = password === confirm;
  const canSubmit =
    emailValid && passwordValid && confirm.length > 0 && match && agreed;
  const emailSuggestion = suggestEmailCorrection(email);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    trackSignUpStarted();
    const normalized = email.trim().toLowerCase();
    const { error: signUpError, alreadyRegistered } = await signUpWithEmail(
      normalized,
      password,
    );
    if (alreadyRegistered) {
      setSubmitting(false);
      setError("An account with this email already exists. Try signing in.");
      return;
    }
    if (signUpError) {
      console.error("signUp failed", signUpError);
      trackSignUpFailed();
      setSubmitting(false);
      setError(signUpError.message || "Couldn't create your account. Try again.");
      return;
    }
    // Carry the consent timestamp to /verify-email, where it's stamped on the
    // user row. If the cookie is lost, verifySignupOtp defaults to verify-time.
    setSignupConsentCookie(new Date().toISOString());
    router.push(`/verify-email?email=${encodeURIComponent(normalized)}`);
  };

  return (
    <AuthShell backHref="/welcome?step=4">
      <h1 className="text-3xl font-bold text-ink">Create account</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-semibold text-ink">
          Log In
        </Link>
      </p>

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
            placeholder="Email Address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
          {emailSuggestion && (
            <p className="mt-1 text-xs text-ink-muted">
              Did you mean{" "}
              <button
                type="button"
                onClick={() => {
                  setEmail(emailSuggestion);
                  setError(null);
                }}
                className="font-semibold text-mention-blue hover:underline"
              >
                {emailSuggestion}
              </button>
              ?
            </p>
          )}
        </motion.div>
        <motion.div {...item}>
          <Input
            leftIcon={<Lock className="h-5 w-5" />}
            type="password"
            autoComplete="new-password"
            placeholder="Password"
            value={password}
            error={password.length > 0 && !passwordValid}
            onChange={(e) => {
              setPassword(e.target.value);
              setError(null);
            }}
          />
          <PasswordStrengthBar password={password} />
          <FormError className="mt-1 text-xs text-ink-placeholder">
            {password.length > 0 && !passwordValid
              ? `Use at least ${MIN_PASSWORD_LENGTH} characters.`
              : null}
          </FormError>
          {password.length > 0 && isCommonPassword(password) && (
            <p className="mt-1 text-xs font-medium text-warning">
              This password is too common.
            </p>
          )}
        </motion.div>
        <motion.div {...item}>
          <Input
            leftIcon={<Lock className="h-5 w-5" />}
            type="password"
            autoComplete="new-password"
            placeholder="Confirm Password"
            value={confirm}
            error={confirm.length > 0 && !match}
            onChange={(e) => {
              setConfirm(e.target.value);
              setError(null);
            }}
          />
          <FormError className="mt-1 text-xs">
            {confirm.length > 0 && !match ? "Passwords don't match." : null}
          </FormError>
          {confirm.length > 0 && match && (
            <p className="mt-1 flex items-center gap-1 text-xs font-medium text-priority-optional">
              <Check className="h-3 w-3" strokeWidth={3} aria-hidden /> Passwords
              match
            </p>
          )}
        </motion.div>

        <motion.label {...item} className="flex cursor-pointer items-start gap-3 pt-1">
          <input
            type="checkbox"
            checked={agreed}
            onChange={(e) => setAgreed(e.target.checked)}
            className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-primary"
          />
          <span className="text-sm leading-snug text-ink-muted">
            <LegalConsentLabel />
          </span>
        </motion.label>

        <motion.div {...item} className="space-y-3">
          <FormError>{error}</FormError>
          <AuthButton type="submit" loading={submitting} disabled={!canSubmit}>
            Sign Up
          </AuthButton>
        </motion.div>
      </motion.form>

      <OrDivider />
      <OAuthButtons onError={(m) => setError(m || null)} />
    </AuthShell>
  );
}
