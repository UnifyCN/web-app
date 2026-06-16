"use client";

import { useState } from "react";
import { Lock } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Input } from "@/components/ui/Input";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/auth/FormError";
import { useToast } from "@/components/ui/ToastProvider";
import { useUpdatePassword } from "@/hooks/useAccount";
import { MIN_PASSWORD_LENGTH } from "@/lib/authValidation";

/** Set a new password from Settings → Account. */
export function ChangePasswordModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const toast = useToast();
  const mutation = useUpdatePassword();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setPassword("");
    setConfirm("");
    setError(null);
    mutation.reset();
    onClose();
  };

  const valid = password.length >= MIN_PASSWORD_LENGTH && password === confirm;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!valid) {
      setError(
        password.length < MIN_PASSWORD_LENGTH
          ? `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
          : "Passwords don't match.",
      );
      return;
    }
    setError(null);
    mutation.mutate(password, {
      onSuccess: () => {
        toast.success("Password updated");
        close();
      },
      onError: (err) =>
        setError(
          err instanceof Error ? err.message : "Couldn't update your password.",
        ),
    });
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={mutation.isPending}
      title="Change password"
      description="Enter a new password for your account."
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <Input
          leftIcon={<Lock className="h-5 w-5" />}
          type="password"
          autoComplete="new-password"
          placeholder="New Password"
          value={password}
          onChange={(e) => {
            setPassword(e.target.value);
            setError(null);
          }}
        />
        <Input
          leftIcon={<Lock className="h-5 w-5" />}
          type="password"
          autoComplete="new-password"
          placeholder="Confirm Password"
          value={confirm}
          error={confirm.length > 0 && confirm !== password}
          onChange={(e) => {
            setConfirm(e.target.value);
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
            disabled={mutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            size="sm"
            loading={mutation.isPending}
            disabled={!valid}
          >
            Update password
          </Button>
        </div>
      </form>
    </ModalShell>
  );
}
