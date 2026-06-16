"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { OtpInput } from "@/components/auth/OtpInput";
import { FormError } from "@/components/auth/FormError";
import { useToast } from "@/components/ui/ToastProvider";
import {
  useRequestEmailChange,
  useVerifyEmailChange,
} from "@/hooks/useAccount";
import { EMAIL_RE } from "@/lib/authValidation";

/**
 * Two-step email change from Settings → Account: request a confirmation code for
 * the new address, then verify it. (With Supabase "Secure email change" on, a
 * code is also sent to the current address.)
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
  const toast = useToast();
  const request = useRequestEmailChange();
  const verify = useVerifyEmailChange();
  const [step, setStep] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  const busy = request.isPending || verify.isPending;

  const close = () => {
    setStep("email");
    setEmail("");
    setCode("");
    setError(null);
    request.reset();
    verify.reset();
    onClose();
  };

  const handleRequest = (event: React.FormEvent) => {
    event.preventDefault();
    const normalized = email.trim().toLowerCase();
    if (!EMAIL_RE.test(normalized)) {
      setError("Enter a valid email address.");
      return;
    }
    if (currentEmail && normalized === currentEmail.toLowerCase()) {
      setError("That's already your email.");
      return;
    }
    setError(null);
    request.mutate(normalized, {
      onSuccess: () => setStep("code"),
      onError: (err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't start the email change.",
        ),
    });
  };

  const handleVerify = (event?: React.FormEvent) => {
    event?.preventDefault();
    if (code.length !== 6) {
      setError("Enter the 6-digit code.");
      return;
    }
    setError(null);
    verify.mutate(
      { email: email.trim().toLowerCase(), token: code },
      {
        onSuccess: () => {
          toast.success("Email updated");
          close();
        },
        onError: (err) =>
          setError(
            err instanceof Error
              ? err.message
              : "That code is invalid or expired.",
          ),
      },
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={busy}
      title="Change email"
      description={
        step === "email"
          ? "We'll email a confirmation code to your new address."
          : `Enter the code we sent to ${email}.`
      }
    >
      {step === "email" ? (
        <form onSubmit={handleRequest} className="space-y-3" noValidate>
          <Input
            leftIcon={<Mail className="h-5 w-5" />}
            type="email"
            autoComplete="email"
            placeholder="New email address"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              setError(null);
            }}
          />
          <FormError className="text-xs">{error}</FormError>
          <div className="flex justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={close}
              disabled={busy}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={request.isPending}
              disabled={!EMAIL_RE.test(email.trim())}
            >
              Send code
            </Button>
          </div>
        </form>
      ) : (
        <form onSubmit={handleVerify} className="space-y-4" noValidate>
          <OtpInput
            value={code}
            onChange={(v) => {
              setCode(v);
              setError(null);
            }}
            onComplete={() => handleVerify()}
            error={Boolean(error)}
            autoFocus
          />
          <FormError className="text-center text-xs">{error}</FormError>
          <div className="flex justify-end gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => {
                setStep("email");
                setCode("");
                setError(null);
              }}
              disabled={busy}
            >
              Back
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={verify.isPending}
              disabled={code.length !== 6}
            >
              Confirm
            </Button>
          </div>
        </form>
      )}
    </ModalShell>
  );
}
