import { useMutation } from "@tanstack/react-query";
import * as auth from "@/services/auth";

/**
 * Account mutations for the Settings → Account section. Each unwraps the
 * service's `{ error }` result and throws so React Query surfaces it via
 * `isError` / `onError`, matching the profile-mutation pattern.
 */

/**
 * Change the signed-in user's password. Supabase has no "verify current
 * password" primitive, so we re-authenticate with `signInWithPassword` first
 * (a wrong current password fails here), then set the new password.
 */
export function useUpdatePassword() {
  return useMutation({
    mutationFn: async ({
      email,
      currentPassword,
      newPassword,
    }: {
      email: string;
      currentPassword: string;
      newPassword: string;
    }) => {
      const { error: verifyError } = await auth.signInWithEmail(
        email,
        currentPassword,
      );
      if (verifyError) throw new Error("Current password is incorrect");
      const { error } = await auth.updatePassword(newPassword);
      if (error) throw error;
    },
  });
}

/** Request an email change — Supabase emails a confirmation link (`updateUser`). */
export function useRequestEmailChange() {
  return useMutation({
    mutationFn: async (newEmail: string) => {
      const { error } = await auth.requestEmailChange(newEmail);
      if (error) throw error;
    },
  });
}

/** Permanently delete the signed-in user's account (`DELETE /api/account`). */
export function useDeleteAccount() {
  return useMutation({
    mutationFn: () => auth.deleteAccount(),
  });
}
