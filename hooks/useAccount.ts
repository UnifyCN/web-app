import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as auth from "@/services/auth";
import { AUTH_USER_KEY } from "@/hooks/useAuthUser";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";

/**
 * Account mutations for the Settings → Account section. Each unwraps the
 * service's `{ error }` result and throws so React Query surfaces it via
 * `isError` / `onError`, matching the profile-mutation pattern.
 */

/** Set a new password for the signed-in user (`updateUser`). */
export function useUpdatePassword() {
  return useMutation({
    mutationFn: async (newPassword: string) => {
      const { error } = await auth.updatePassword(newPassword);
      if (error) throw error;
    },
  });
}

/** Request an email change — Supabase emails a confirmation code (`updateUser`). */
export function useRequestEmailChange() {
  return useMutation({
    mutationFn: async (newEmail: string) => {
      const { error } = await auth.requestEmailChange(newEmail);
      if (error) throw error;
    },
  });
}

/** Confirm the pending email change with the emailed code (`verifyOtp`). */
export function useVerifyEmailChange() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ email, token }: { email: string; token: string }) => {
      const { error } = await auth.verifyEmailChangeOtp(email, token);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_USER_KEY });
      queryClient.invalidateQueries({ queryKey: CURRENT_USER_KEY });
    },
  });
}
