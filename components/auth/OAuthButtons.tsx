"use client";

import { useState } from "react";
import { signInWithGoogle } from "@/services/auth";
import { GoogleIcon } from "@/components/auth/BrandIcons";

const SQUARE =
  "flex h-14 w-16 items-center justify-center rounded-xl border border-border-card bg-surface " +
  "transition-colors hover:bg-surface-gray cursor-pointer disabled:cursor-not-allowed disabled:opacity-60 " +
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2";

/**
 * Compact Google SSO button shown under the "or" divider on the sign-in and
 * sign-up screens. Runs the Google OAuth flow.
 */
export function OAuthButtons({
  onError,
}: {
  onError?: (message: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  const handleGoogle = async () => {
    setBusy(true);
    onError?.("");
    const { error } = await signInWithGoogle();
    if (error) {
      console.error("Google sign-in failed", error);
      setBusy(false);
      onError?.("Couldn't start Google sign-in. Please try again.");
    }
  };

  return (
    <div className="flex items-center justify-center gap-3">
      <button
        type="button"
        onClick={handleGoogle}
        disabled={busy}
        className={SQUARE}
        aria-label="Continue with Google"
      >
        <GoogleIcon className="h-6 w-6" />
      </button>
    </div>
  );
}
