"use client";

import { useState } from "react";
import { Mail } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
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
      setError("Enter a valid email address.");
      return;
    }
    if (currentEmail && normalized === currentEmail.toLowerCase()) {
      setError("That's already your email.");
      return;
    }
    setError(null);
    request.mutate(normalized, {
      onSuccess: () => setStep("sent"),
      onError: (err) =>
        setError(
          err instanceof Error
            ? err.message
            : "Couldn't start the email change.",
        ),
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={request.isPending}
      title="Change email"
      description={
        step === "email"
          ? "We'll email a confirmation link to your new address."
          : undefined
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
              disabled={request.isPending}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              loading={request.isPending}
              disabled={!EMAIL_RE.test(email.trim())}
            >
              Submit
            </Button>
          </div>
        </form>
      ) : (
        <div className="space-y-4">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary-bg">
            <Mail className="h-5 w-5 text-primary" aria-hidden />
          </div>
          <p className="text-sm text-ink-muted">
            We&apos;ve sent a confirmation link to your new email address. Click
            it to confirm the change. Your current email address will receive a
            notification once the change is complete.
          </p>
          <div className="flex justify-end">
            <Button type="button" size="sm" onClick={close}>
              Done
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
