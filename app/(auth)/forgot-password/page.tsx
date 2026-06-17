"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { Mail } from "lucide-react";
import { AuthShell } from "@/components/auth/AuthShell";
import { AuthButton } from "@/components/auth/AuthButton";
import { FormError } from "@/components/auth/FormError";
import { useStagger } from "@/components/auth/motion";
import { Input } from "@/components/ui/Input";
import { EMAIL_RE } from "@/lib/authValidation";
import { sendPasswordReset } from "@/services/auth";

/** Forgot password — collect the email, then send a recovery code. */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const { container, item } = useStagger();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canSubmit = EMAIL_RE.test(email.trim());

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canSubmit || submitting) return;
    setSubmitting(true);
    setError(null);
    const normalized = email.trim().toLowerCase();
    const { error: resetError } = await sendPasswordReset(normalized);
    if (resetError) {
      console.error("resetPasswordForEmail failed", resetError);
      setSubmitting(false);
      setError(resetError.message || "Couldn't send a reset code. Try again.");
      return;
    }
    router.push(`/reset-password?email=${encodeURIComponent(normalized)}`);
  };

  return (
    <AuthShell backHref="/login">
      <h1 className="text-3xl font-bold text-ink">Reset password</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Enter your email and we&apos;ll send you a code to reset your password.
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
        </motion.div>
        <motion.div {...item} className="space-y-3">
          <FormError>{error}</FormError>
          <AuthButton type="submit" loading={submitting} disabled={!canSubmit}>
            Send reset code
          </AuthButton>
        </motion.div>
      </motion.form>
    </AuthShell>
  );
}
