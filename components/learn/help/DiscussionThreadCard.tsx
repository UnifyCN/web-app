"use client";

import { useMemo, useState } from "react";
import { ArrowBigUp, Flag, MessageSquare, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { ReportModal } from "@/components/moderation/ReportModal";
import { useToast } from "@/components/ui/ToastProvider";
import {
  useCreateReply,
  useDeleteDiscussion,
  useDiscussionReplies,
  useReportDiscussion,
  useToggleDiscussionLike,
} from "@/hooks/useDiscussions";
import { DiscussionReplyItem } from "./DiscussionReplyItem";
import { DiscussionComposer } from "./DiscussionComposer";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Discussion } from "@/types";

/**
 * One question thread on the module board: purple upvote rail, author line
 * with the submodule context pill, body, and an expandable one-level reply
 * list with an inline reply composer. The most-liked reply (≥1 like, ties →
 * oldest) is badged "Top reply". Replies load lazily on first expand.
 */
export function DiscussionThreadCard({
  discussion,
  moduleId,
  submoduleTitle,
  currentUserId,
}: {
  discussion: Discussion;
  moduleId: string;
  /** Resolved display title of the thread's submodule tag (null = none). */
  submoduleTitle: string | null;
  currentUserId?: string;
}) {
  const toast = useToast();
  const [expanded, setExpanded] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);

  const likeMutation = useToggleDiscussionLike();
  const deleteMutation = useDeleteDiscussion();
  const reportMutation = useReportDiscussion();
  const createReply = useCreateReply();
  const repliesQuery = useDiscussionReplies(discussion.id, expanded);

  const liked = discussion.likedByMe ?? false;
  const isOwn =
    currentUserId != null && discussion.author.id === currentUserId;
  const replies = useMemo(() => repliesQuery.data ?? [], [repliesQuery.data]);

  // Top reply = highest likeCount with at least one like; ties go to the
  // earliest (replies arrive oldest-first, so the first max wins).
  const topReplyId = useMemo(() => {
    let best: { id: string; likes: number } | null = null;
    for (const reply of replies) {
      if (reply.likeCount >= 1 && (!best || reply.likeCount > best.likes)) {
        best = { id: reply.id, likes: reply.likeCount };
      }
    }
    return best?.id ?? null;
  }, [replies]);

  async function submitReply(body: string) {
    setReplyError(null);
    try {
      await createReply.mutateAsync({
        discussionId: discussion.id,
        body,
        moduleId,
      });
    } catch (err) {
      setReplyError(
        err instanceof Error ? err.message : "Failed to post the reply.",
      );
      throw err; // keep the draft in the composer
    }
  }

  return (
    <article
      className={cn(
        "rounded-card border border-border-card bg-surface p-4",
        deleteMutation.isPending && "opacity-50",
      )}
    >
      <div className="flex gap-3">
        {/* Upvote rail */}
        <div className="flex shrink-0 flex-col items-center gap-0.5">
          <button
            type="button"
            onClick={() =>
              likeMutation.mutate({
                discussionId: discussion.id,
                moduleId,
                liked,
              })
            }
            disabled={likeMutation.isPending}
            aria-pressed={liked}
            aria-label={liked ? "Remove upvote" : "Upvote question"}
            className={cn(
              "flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg border transition-colors disabled:cursor-not-allowed disabled:opacity-60",
              liked
                ? "border-purple-600 bg-purple-50 text-purple-700"
                : "border-border-card text-ink-muted hover:bg-surface-gray hover:text-ink",
            )}
          >
            <ArrowBigUp
              className={cn("h-5 w-5", liked && "fill-purple-600")}
              aria-hidden
            />
          </button>
          <span
            className={cn(
              "text-xs font-semibold",
              liked ? "text-purple-700" : "text-ink-tertiary",
            )}
          >
            {discussion.likeCount}
          </span>
        </div>

        {/* Body */}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Avatar
              username={discussion.author.username}
              profilePictureUrl={discussion.author.profilePictureUrl}
              size={24}
            />
            <span className="truncate text-xs font-semibold text-ink-secondary">
              {discussion.author.username}
            </span>
            {submoduleTitle && (
              <span className="hidden shrink-0 rounded-full bg-purple-50 px-2 py-0.5 text-[10px] font-medium text-purple-700 sm:inline">
                {submoduleTitle}
              </span>
            )}
            <span className="shrink-0 text-xs text-ink-placeholder">
              {formatRelativeTime(discussion.createdAt)}
            </span>
            <div className="ml-auto">
              <DropdownMenu
                ariaLabel="Question options"
                items={
                  isOwn
                    ? [
                        {
                          key: "delete",
                          label: "Delete question",
                          icon: <Trash2 className="h-4 w-4" aria-hidden />,
                          destructive: true,
                          onSelect: () => setConfirmOpen(true),
                        },
                      ]
                    : [
                        {
                          key: "report",
                          label: "Report question",
                          icon: <Flag className="h-4 w-4" aria-hidden />,
                          destructive: true,
                          onSelect: () => setReportOpen(true),
                        },
                      ]
                }
              />
            </div>
          </div>

          <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-secondary">
            {discussion.body}
          </p>

          <button
            type="button"
            onClick={() => setExpanded((value) => !value)}
            aria-expanded={expanded}
            className="mt-2 flex cursor-pointer items-center gap-1.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
          >
            <MessageSquare className="h-3.5 w-3.5" aria-hidden />
            {discussion.replyCount === 0
              ? "Reply"
              : `${discussion.replyCount} ${discussion.replyCount === 1 ? "reply" : "replies"}`}
          </button>

          {expanded && (
            <div className="mt-3 space-y-3 border-l-2 border-purple-100 pl-3">
              {repliesQuery.isLoading ? (
                <p className="text-xs text-ink-placeholder">Loading replies…</p>
              ) : (
                replies.map((reply) => (
                  <DiscussionReplyItem
                    key={reply.id}
                    reply={reply}
                    discussionId={discussion.id}
                    moduleId={moduleId}
                    currentUserId={currentUserId}
                    isTopReply={reply.id === topReplyId}
                  />
                ))
              )}
              <DiscussionComposer
                placeholder="Write a reply…"
                isPending={createReply.isPending}
                onSubmit={submitReply}
                errorMessage={replyError}
                compact
              />
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Delete this question?"
        description="This will permanently remove your question and its replies. This can't be undone."
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={() =>
          deleteMutation.mutate(
            { discussionId: discussion.id, moduleId },
            { onSettled: () => setConfirmOpen(false) },
          )
        }
        onCancel={() => setConfirmOpen(false)}
      />

      <ReportModal
        open={reportOpen}
        target={{ type: "discussion" }}
        isPending={reportMutation.isPending}
        onSubmit={(reason) =>
          reportMutation.mutate(
            { discussionId: discussion.id, reason },
            {
              onSuccess: () => {
                setReportOpen(false);
                toast.success("Report sent. Thanks for flagging this.");
              },
              onError: () => {
                setReportOpen(false);
                toast.error("Couldn't send report. Please try again.");
              },
            },
          )
        }
        onClose={() => setReportOpen(false)}
      />
    </article>
  );
}
