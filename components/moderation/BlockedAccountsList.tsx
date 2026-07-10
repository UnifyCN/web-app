"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { useToast } from "@/components/ui/ToastProvider";
import { useBlockedUsers, useUnblockUser } from "@/hooks/useModeration";

/**
 * Settings list of the accounts the signed-in user has blocked, each with an
 * Unblock button. Reads `useBlockedUsers`; unblocking invalidates the moderation
 * + feed caches via the hook.
 */
export function BlockedAccountsList() {
  const { t } = useTranslation();
  const { data: blocked, isLoading, isError } = useBlockedUsers();
  const toast = useToast();
  const unblock = useUnblockUser();

  if (isLoading) {
    return (
      <div className="space-y-3" aria-hidden>
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3">
            <div className="h-9 w-9 animate-pulse rounded-full bg-surface-gray" />
            <div className="h-4 w-32 animate-pulse rounded bg-surface-gray" />
          </div>
        ))}
      </div>
    );
  }

  if (isError) {
    return (
      <p className="text-sm text-destructive" role="alert">
        {t("settingsWeb.blockedLoadError")}
      </p>
    );
  }

  if (!blocked || blocked.length === 0) {
    return (
      <p className="text-sm text-ink-placeholder">
        {t("settingsWeb.blockedEmpty")}
      </p>
    );
  }

  return (
    <ul className="divide-y divide-border-card">
      {blocked.map((user) => (
        <li
          key={user.id}
          className="flex items-center gap-3 py-3 first:pt-0 last:pb-0"
        >
          <Link
            href={`/profile/${user.id}`}
            className="flex min-w-0 flex-1 items-center gap-3"
          >
            <Avatar
              username={user.username}
              profilePictureUrl={user.profilePictureUrl}
              size={36}
            />
            <span className="truncate text-sm font-medium text-ink-secondary">
              {user.username}
            </span>
          </Link>
          <Button
            variant="secondary"
            size="sm"
            loading={unblock.isPending && unblock.variables === user.id}
            onClick={() =>
              unblock.mutate(user.id, {
                onSuccess: () => toast.success(t("settingsWeb.userUnblocked")),
                onError: (e) =>
                  toast.show(
                    e instanceof Error
                      ? e.message
                      : t("settingsWeb.unblockError"),
                    "info",
                  ),
              })
            }
          >
            {t("settingsWeb.unblock")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
