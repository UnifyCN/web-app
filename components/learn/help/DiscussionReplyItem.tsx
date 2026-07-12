"use client";

import { useState } from "react";
import { BadgeCheck, Flag, Heart, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { ReportModal } from "@/components/moderation/ReportModal";
import { useToast } from "@/components/ui/ToastProvider";
import {
  useDeleteReply,
  useReportReply,
  useToggleReplyLike,
} from "@/hooks/useDiscussions";
import { TranslateButton } from "@/components/home/TranslateButton";
import { cn } from "@/lib/utils";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import type { DiscussionReply } from "@/types";

/**
 * One reply row in an expanded thread. Likes are optimistic via the hook's
 * cache patch (the row just renders `likedByMe`/`likeCount`); the most-liked
 * reply in the thread gets the "Top reply" badge (computed by the parent).
 */
export function DiscussionReplyItem({
  reply,
  discussionId,
  moduleId,
  currentUserId,
  isTopReply,
}: {
  reply: DiscussionReply;
  discussionId: string;
  moduleId: string;
  currentUserId?: string;
  isTopReply: boolean;
}) {
  const { t } = useTranslation();
  const formatRelativeTime = useRelativeTime();
  const toast = useToast();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const likeMutation = useToggleReplyLike();
  const deleteMutation = useDeleteReply();
  const reportMutation = useReportReply();

  const liked = reply.likedByMe ?? false;
  const isOwn = currentUserId != null && reply.author.id === currentUserId;

  return (
    <div
      className={cn(
        "flex gap-2.5",
        deleteMutation.isPending && "opacity-50",
      )}
    >
      <Avatar
        username={reply.author.username}
        profilePictureUrl={reply.author.profilePictureUrl}
        size={28}
        className="shrink-0 self-start"
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-xs font-semibold text-ink-secondary">
            {reply.author.username}
          </span>
          {isTopReply && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-success-label/10 px-1.5 py-0.5 text-[10px] font-semibold text-success-label">
              <BadgeCheck className="h-3 w-3" aria-hidden />
              {t("learnWeb.discussion.topReply")}
            </span>
          )}
          <span className="shrink-0 text-xs text-ink-placeholder">
            {formatRelativeTime(reply.createdAt)}
          </span>
          <div className="ml-auto">
            <DropdownMenu
              ariaLabel={t("learnWeb.discussion.replyOptionsAria")}
              items={
                isOwn
                  ? [
                      {
                        key: "delete",
                        label: t("learnWeb.discussion.deleteReply"),
                        icon: <Trash2 className="h-4 w-4" aria-hidden />,
                        destructive: true,
                        onSelect: () => setConfirmOpen(true),
                      },
                    ]
                  : [
                      {
                        key: "report",
                        label: t("learnWeb.discussion.reportReply"),
                        icon: <Flag className="h-4 w-4" aria-hidden />,
                        destructive: true,
                        onSelect: () => setReportOpen(true),
                      },
                    ]
              }
            />
          </div>
        </div>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-muted">
          {reply.body}
        </p>
        <TranslateButton
          type="discussion_reply"
          id={reply.id}
          className="mt-1"
        />
        <button
          type="button"
          onClick={() =>
            likeMutation.mutate({ replyId: reply.id, discussionId, liked })
          }
          disabled={likeMutation.isPending}
          aria-pressed={liked}
          aria-label={
            liked
              ? t("learnWeb.discussion.unlikeReplyAria")
              : t("learnWeb.discussion.likeReplyAria")
          }
          className="mt-1 flex cursor-pointer items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed"
        >
          <Heart
            className={cn(
              "h-3.5 w-3.5",
              liked && "fill-purple-600 text-purple-600",
            )}
            aria-hidden
          />
          {reply.likeCount > 0 && (
            <span className={cn(liked && "text-purple-700")}>
              {reply.likeCount}
            </span>
          )}
        </button>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title={t("learnWeb.discussion.deleteReplyTitle")}
        description={t("learnWeb.discussion.deleteReplyBody")}
        confirmLabel={t("common.delete")}
        isPending={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(
            { replyId: reply.id, discussionId, moduleId },
            { onSettled: () => setConfirmOpen(false) },
          )
        }
        onCancel={() => setConfirmOpen(false)}
      />

      <ReportModal
        open={reportOpen}
        target={{ type: "discussion-reply" }}
        isPending={reportMutation.isPending}
        onSubmit={(reason) =>
          reportMutation.mutate(
            { replyId: reply.id, reason },
            {
              onSuccess: () => {
                setReportOpen(false);
                toast.success(t("learnWeb.discussion.reportSent"));
              },
              onError: () => {
                setReportOpen(false);
                toast.error(t("learnWeb.discussion.reportFailed"));
              },
            },
          )
        }
        onClose={() => setReportOpen(false)}
      />
    </div>
  );
}
