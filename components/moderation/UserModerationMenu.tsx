"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Ban, UserCheck } from "lucide-react";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { ReportModal } from "@/components/moderation/ReportModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/ToastProvider";
import { useCurrentUser } from "@/hooks/useProfile";
import {
  useReportUser,
  useBlockUser,
  useUnblockUser,
  useUserBlockStatus,
} from "@/hooks/useModeration";

/**
 * Kebab menu of moderation actions for another user's profile (Report user,
 * Block / Unblock). Renders nothing for your own profile or when signed out.
 */
export function UserModerationMenu({
  userId,
  username,
}: {
  userId: string;
  username: string;
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const toast = useToast();
  const reportUser = useReportUser();
  const blockUser = useBlockUser();
  const unblockUser = useUnblockUser();
  const isSelf = currentUser?.id === userId;
  const { data: isBlocked } = useUserBlockStatus(userId, {
    enabled: Boolean(currentUser) && !isSelf,
  });
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  if (!currentUser || isSelf) return null;

  const reportItem: DropdownMenuItem = {
    key: "report",
    label: t("reportScreen.titleUser"),
    icon: <Flag className="h-4 w-4" aria-hidden />,
    onSelect: () => setReportOpen(true),
  };

  const blockItem: DropdownMenuItem = isBlocked
    ? {
        key: "unblock",
        label: t("profile.unblockUser"),
        icon: <UserCheck className="h-4 w-4" aria-hidden />,
        onSelect: () =>
          unblockUser.mutate(userId, {
            onSuccess: () => toast.success(t("profile.userUnblocked")),
            onError: (e) =>
              toast.show(
                e instanceof Error ? e.message : t("settingsWeb.unblockError"),
                "info",
              ),
          }),
      }
    : {
        key: "block",
        label: t("profile.blockUser"),
        icon: <Ban className="h-4 w-4" aria-hidden />,
        destructive: true,
        onSelect: () => setBlockOpen(true),
      };

  return (
    <>
      <DropdownMenu
        items={[reportItem, blockItem]}
        ariaLabel={t("moderation.userOptionsAria", { username })}
      />

      <ReportModal
        open={reportOpen}
        target={{ type: "user" }}
        isPending={reportUser.isPending}
        onClose={() => {
          if (!reportUser.isPending) setReportOpen(false);
        }}
        onSubmit={(reason) =>
          reportUser.mutate(
            { userId, reason },
            {
              onSuccess: () => {
                setReportOpen(false);
                toast.success(t("reportScreen.submittedToast"));
              },
              onError: (e) =>
                toast.show(
                  e instanceof Error
                    ? e.message
                    : t("reportScreen.submitFailed"),
                  "info",
                ),
            },
          )
        }
      />

      <ConfirmModal
        open={blockOpen}
        title={t("moderation.blockConfirmTitle", { username })}
        description={t("moderation.blockConfirmDesc")}
        confirmLabel={t("profile.block")}
        isPending={blockUser.isPending}
        onCancel={() => {
          if (!blockUser.isPending) setBlockOpen(false);
        }}
        onConfirm={() =>
          blockUser.mutate(userId, {
            onSuccess: () => {
              setBlockOpen(false);
              toast.success(t("profile.userBlocked"));
            },
            onError: (e) =>
              toast.show(
                e instanceof Error ? e.message : t("profile.userBlockFailed"),
                "info",
              ),
          })
        }
      />
    </>
  );
}
