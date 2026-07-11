"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Lock } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { Button } from "@/components/ui/Button";
import { FormError } from "@/components/auth/FormError";
import { useDeleteAccount } from "@/hooks/useAccount";
import { signOut } from "@/services/auth";

type Phase = "confirm" | "hold" | "error";

/** How long the user must hold before the delete fires. */
const HOLD_MS = 3000;

/**
 * Delete account from Settings → Account. A destructive confirm, then a
 * hold-to-delete button (Emil Kowalski's clip-path technique): pressing it
 * reveals a bright-red overlay left→right over 3s (pure CSS, driven by :active),
 * and a JS 3s setTimeout fires the actual delete — released early, the timer is
 * cleared and the overlay retracts. On success: clear the cache and return to
 * the pre-login welcome screen.
 */
export function DeleteAccountModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const del = useDeleteAccount();
  const [phase, setPhase] = useState<Phase>("confirm");
  const [error, setError] = useState<string | null>(null);
  const holdTimer = useRef<number | null>(null);

  // True once the hold completed and the DELETE is in flight.
  const busy = del.isPending;

  // Clear any pending hold timer if the modal unmounts mid-press.
  useEffect(() => {
    return () => {
      if (holdTimer.current !== null) clearTimeout(holdTimer.current);
    };
  }, []);

  const cancelHold = () => {
    if (holdTimer.current !== null) {
      clearTimeout(holdTimer.current);
      holdTimer.current = null;
    }
  };

  // Fired by the hold timer — i.e. only after the full 3-second hold.
  const fireDelete = () => {
    cancelHold();
    del.mutate(undefined, {
      onSuccess: async () => {
        // The session cookie now points at a deleted user — clear it and the
        // query cache before bouncing to /welcome.
        await signOut().catch(() => {});
        queryClient.clear();
        router.replace("/welcome");
      },
      onError: (err) => {
        setError(
          err instanceof Error ? err.message : t("settings.couldNotDelete"),
        );
        setPhase("error");
      },
    });
  };

  const startHold = () => {
    if (busy) return;
    cancelHold();
    holdTimer.current = window.setTimeout(fireDelete, HOLD_MS);
  };

  const close = () => {
    if (busy) return; // can't bail out mid-delete
    cancelHold();
    setPhase("confirm");
    setError(null);
    del.reset();
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={close}
      busy={busy}
      title={t("settings.deleteAccount")}
      description={
        phase === "confirm" ? t("settingsWeb.deletePermanent") : undefined
      }
    >
      {phase === "confirm" ? (
        <div className="space-y-4">
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-destructive/10">
              <AlertTriangle className="h-5 w-5 text-destructive" aria-hidden />
            </span>
            <p className="text-sm text-ink-muted">
              {t("settingsWeb.deleteAccountBody")}
            </p>
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={close}>
              {t("common.cancel")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={() => {
                setError(null);
                setPhase("hold");
              }}
            >
              {t("settings.deleteAccount")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="space-y-4">
          {phase === "error" ? (
            <FormError className="text-sm">{error}</FormError>
          ) : (
            <p className="text-sm text-ink-muted">
              {t("settingsWeb.deleteHoldInstruction")}
            </p>
          )}

          <button
            type="button"
            disabled={busy}
            onMouseDown={startHold}
            onMouseUp={cancelHold}
            onMouseLeave={cancelHold}
            onTouchStart={startHold}
            onTouchEnd={cancelHold}
            onContextMenu={(e) => e.preventDefault()}
            aria-label={t("settingsWeb.deleteHoldAria")}
            className="hold-delete-btn relative block w-full cursor-pointer touch-none overflow-hidden rounded-lg select-none disabled:cursor-not-allowed disabled:opacity-70"
          >
            {/* Base (pale) layer — defines the button's size. Red text on a
                light-red tint, so the bright overlay sweeping over it (white text
                on vivid red) reads clearly as it reveals. */}
            <span className="flex items-center justify-center gap-2 rounded-lg bg-destructive/15 px-4 py-3 text-sm font-semibold text-destructive">
              {busy ? (
                t("settingsWeb.deletingAccount")
              ) : (
                <>
                  <Lock className="h-4 w-4" aria-hidden />{" "}
                  {t("settingsWeb.holdToDelete")}
                </>
              )}
            </span>
            {/* Bright overlay, clipped from the right; revealed left→right on hold. */}
            <span
              aria-hidden
              className="hold-overlay absolute inset-0 flex items-center justify-center gap-2 rounded-lg bg-destructive text-sm font-semibold text-white"
            >
              {busy ? (
                t("settingsWeb.deletingAccount")
              ) : (
                <>
                  <Lock className="h-4 w-4" aria-hidden />{" "}
                  {t("settingsWeb.holdToDelete")}
                </>
              )}
            </span>
          </button>

          <div className="flex justify-end">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={close}
              disabled={busy}
            >
              {t("common.cancel")}
            </Button>
          </div>
        </div>
      )}
    </ModalShell>
  );
}
