"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Heart, Reply as ReplyIcon, Trash2 } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import { useDeleteComment, useLikeComment } from "@/hooks/useFeed";
import { cn, formatRelativeTime, stripHtml } from "@/lib/utils";
import type { PostComment } from "@/types";

interface PostCommentItemProps {
  comment: PostComment;
  postId: number;
  currentUserId?: string;
  /** Replies to this comment (top-level items only). */
  replies?: PostComment[];
  /** Reply affordance — only passed to top-level comments (2-level threading). */
  onReply?: (comment: PostComment) => void;
  isReply?: boolean;
}

/** A single comment with its like / reply / delete actions and nested replies. */
export function PostCommentItem({
  comment,
  postId,
  currentUserId,
  replies = [],
  onReply,
  isReply = false,
}: PostCommentItemProps) {
  const [liked, setLiked] = useState(comment.likedByMe ?? false);
  const [popping, setPopping] = useState(false);
  const [showReplies, setShowReplies] = useState(true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const likeMutation = useLikeComment();
  const deleteMutation = useDeleteComment();

  // Track the like-pop timeout so it can be cleared if the component unmounts
  // mid-animation (the comment is deleted, replies collapse, route change).
  const popTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (popTimeout.current) clearTimeout(popTimeout.current);
    },
    [],
  );

  const likeCount =
    comment.likeCount + (liked ? 1 : 0) - (comment.likedByMe ? 1 : 0);
  const isOwn = currentUserId != null && comment.userId === currentUserId;

  function toggleLike(event: React.MouseEvent<HTMLButtonElement>) {
    const wasLiked = liked;
    setLiked(!wasLiked);
    // event.detail is 0 for keyboard-activated clicks (Enter/Space); only run
    // the pop animation for real pointer clicks.
    if (!wasLiked && event.detail > 0) {
      setPopping(true);
      if (popTimeout.current) clearTimeout(popTimeout.current);
      popTimeout.current = setTimeout(() => setPopping(false), 220);
    }
    likeMutation.mutate(
      { commentId: comment.id, postId, liked: wasLiked },
      { onError: () => setLiked(wasLiked) },
    );
  }

  function confirmDelete() {
    if (deleteMutation.isPending) return;
    deleteMutation.mutate(
      { commentId: comment.id, postId },
      { onSettled: () => setConfirmOpen(false) },
    );
  }

  return (
    <>
      <div
        id={`comment-${comment.id}`}
        className={cn(
          "flex scroll-mt-24 gap-3 rounded-lg transition-colors target:bg-primary-bg",
          deleteMutation.isPending && "opacity-50",
        )}
      >
        <Link
          href={`/profile/${comment.author.id}`}
          aria-label={`View ${comment.author.username}'s profile`}
          className="shrink-0 self-start rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Avatar
            username={comment.author.username}
            profilePictureUrl={comment.author.profilePictureUrl}
            size={isReply ? 30 : 36}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={`/profile/${comment.author.id}`}
              className="truncate text-sm font-semibold text-ink-secondary transition-colors hover:text-primary hover:underline"
            >
              {comment.author.username}
            </Link>
            <span className="shrink-0 text-xs text-ink-placeholder">
              {formatRelativeTime(comment.createdAt)}
            </span>
          </div>
          <p className="mt-0.5 whitespace-pre-wrap break-words text-sm leading-relaxed text-ink-muted">
            {stripHtml(comment.content)}
          </p>

          <div className="mt-1.5 flex items-center gap-4">
            <button
              type="button"
              onClick={toggleLike}
              disabled={likeMutation.isPending}
              aria-pressed={liked}
              aria-label={liked ? "Unlike comment" : "Like comment"}
              className="flex cursor-pointer items-center gap-1 text-xs text-ink-muted transition-colors hover:text-ink disabled:cursor-not-allowed"
            >
              <Heart
                className={cn(
                  "h-4 w-4",
                  popping && "animate-like-pop",
                  liked && "fill-destructive text-destructive",
                )}
                aria-hidden
              />
              {likeCount > 0 && (
                <span className={cn(liked && "text-destructive")}>
                  {likeCount}
                </span>
              )}
            </button>

            {!isReply && onReply && (
              <button
                type="button"
                onClick={() => onReply(comment)}
                className="flex cursor-pointer items-center gap-1 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
              >
                <ReplyIcon className="h-3.5 w-3.5" aria-hidden />
                Reply
              </button>
            )}

            {isOwn && (
              <button
                type="button"
                onClick={() => setConfirmOpen(true)}
                aria-label="Delete comment"
                className="flex cursor-pointer items-center gap-1 text-xs text-ink-muted transition-colors hover:text-destructive"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden />
              </button>
            )}
          </div>

          {!isReply && replies.length > 0 && (
            <div className="mt-2">
              <button
                type="button"
                onClick={() => setShowReplies((value) => !value)}
                className="cursor-pointer text-xs font-medium text-primary hover:underline"
              >
                {showReplies
                  ? "Hide replies"
                  : `View ${replies.length} ${
                      replies.length === 1 ? "reply" : "replies"
                    }`}
              </button>
              {showReplies && (
                <div className="mt-2 space-y-3 border-l border-border-card pl-3">
                  {replies.map((reply) => (
                    <PostCommentItem
                      key={reply.id}
                      comment={reply}
                      postId={postId}
                      currentUserId={currentUserId}
                      isReply
                    />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      <ConfirmModal
        open={confirmOpen}
        title="Delete this comment?"
        description="This will permanently remove your comment. This can't be undone."
        confirmLabel="Delete"
        isPending={deleteMutation.isPending}
        onConfirm={confirmDelete}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
