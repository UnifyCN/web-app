"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Lock } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Input } from "@/components/ui/Input";
import { AuthButton } from "@/components/auth/AuthButton";
import { FormError } from "@/components/auth/FormError";
import { useToast } from "@/components/ui/ToastProvider";
import { useUpdatePassword } from "@/hooks/useAccount";
import { MIN_PASSWORD_LENGTH } from "@/lib/authValidation";

/** Set a new password from Settings → Account. Verifies the current password
 *  first (re-auth), then updates to the new one. */
export function ChangePasswordModal({
  open,
  onClose,
  currentEmail,
}: {
  open: boolean;
  onClose: () => void;
  currentEmail?: string;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const mutation = useUpdatePassword();
  const [currentPassword, setCurrentPassword] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    setCurrentPassword("");
    setPassword("");
    setConfirm("");
    setError(null);
    mutation.reset();
    onClose();
  };

  const valid =
    currentPassword.length > 0 &&
    password.length >= MIN_PASSWORD_LENGTH &&
    password === confirm;

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentEmail) {
      setError(t("settingsWeb.addEmailFirst"));
      return;
    }
    if (!valid) {
      setError(
        currentPassword.length === 0
          ? t("settingsWeb.currentPasswordRequired")
          : password.length < MIN_PASSWORD_LENGTH
            ? t("settingsWeb.passwordMinLength", {
                count: MIN_PASSWORD_LENGTH,
              })
            : t("auth.passwordsDoNotMatch"),
      );
      return;
    }
    setError(null);
    mutation.mutate(
      { email: currentEmail, currentPassword, newPassword: password },
      {
        onSuccess: () => {
          toast.success(t("settingsWeb.passwordUpdated"));
          close();
        },
        onError: (err) =>
          setError(
            err instanceof Error
              ? err.message
              : t("settingsWeb.passwordUpdateFailed"),
          ),
      },
    );
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={mutation.isPending}
      title={t("settingsWeb.changePassword")}
      description={t("settingsWeb.changePasswordModalDesc")}
    >
      <form onSubmit={handleSubmit} className="space-y-3" noValidate>
        <Input
          leftIcon={<Lock className="h-5 w-5" />}
          type="password"
          autoComplete="current-password"
          placeholder={t("settingsWeb.currentPasswordPlaceholder")}
          value={currentPassword}
          onChange={(e) => {
            setCurrentPassword(e.target.value);
            setError(null);
          }}
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
        <Input
          leftIcon={<Lock className="h-5 w-5" />}
          type="password"
          autoComplete="new-password"
          placeholder={t("auth.confirmPassword")}
          value={confirm}
          error={confirm.length > 0 && confirm !== password}
          onChange={(e) => {
            setConfirm(e.target.value);
            setError(null);
          }}
        />
        <FormError className="text-xs">{error}</FormError>
        <div className="space-y-2 pt-2">
          <AuthButton type="submit" loading={mutation.isPending} disabled={!valid}>
            {t("settingsWeb.updatePassword")}
          </AuthButton>
          <button
            type="button"
            onClick={close}
            disabled={mutation.isPending}
            className="w-full cursor-pointer rounded-full py-2.5 text-sm font-semibold text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed disabled:opacity-60"
          >
            {t("common.cancel")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
