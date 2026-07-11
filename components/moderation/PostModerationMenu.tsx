"use client";

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Flag, Ban } from "lucide-react";
import {
  DropdownMenu,
  type DropdownMenuItem,
} from "@/components/ui/DropdownMenu";
import { ReportModal } from "@/components/moderation/ReportModal";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useToast } from "@/components/ui/ToastProvider";
import { useCurrentUser } from "@/hooks/useProfile";
import { useReportPost, useBlockUser } from "@/hooks/useModeration";
import type { Post } from "@/types";

/**
 * Kebab menu of moderation actions for another user's post (Report post / Block
 * author). Renders nothing for the signed-in user's own posts or when signed
 * out — own-post actions (delete) live elsewhere. Used by PostCard, so it covers
 * the feed and the post-detail page in one place.
 */
export function PostModerationMenu({
  post,
  align = "end",
}: {
  post: Post;
  align?: "start" | "end";
}) {
  const { t } = useTranslation();
  const { data: currentUser } = useCurrentUser();
  const toast = useToast();
  const reportPost = useReportPost();
  const blockUser = useBlockUser();
  const [reportOpen, setReportOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);

  const authorId = post.author.id;
  if (!currentUser || currentUser.id === authorId) return null;

  const items: DropdownMenuItem[] = [
    {
      key: "report",
      label: t("reportScreen.titlePost"),
      icon: <Flag className="h-4 w-4" aria-hidden />,
      onSelect: () => setReportOpen(true),
    },
    {
      key: "block",
      label: t("moderation.blockUser", { username: post.author.username }),
      icon: <Ban className="h-4 w-4" aria-hidden />,
      destructive: true,
      onSelect: () => setBlockOpen(true),
    },
  ];

  return (
    <>
      <DropdownMenu
        items={items}
        ariaLabel={t("moderation.postOptionsAria")}
        align={align}
      />

      <ReportModal
        open={reportOpen}
        target={{ type: "post" }}
        isPending={reportPost.isPending}
        onClose={() => {
          if (!reportPost.isPending) setReportOpen(false);
        }}
        onSubmit={(reason) =>
          reportPost.mutate(
            { postId: post.id, reason },
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
        title={t("moderation.blockConfirmTitle", {
          username: post.author.username,
        })}
        description={t("moderation.blockConfirmDesc")}
        confirmLabel={t("profile.block")}
        isPending={blockUser.isPending}
        onCancel={() => {
          if (!blockUser.isPending) setBlockOpen(false);
        }}
        onConfirm={() =>
          blockUser.mutate(authorId, {
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
