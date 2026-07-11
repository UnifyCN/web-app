"use client";

import Link from "next/link";
import { useTranslation } from "react-i18next";
import { useRelativeTime } from "@/hooks/useRelativeTime";
import { stripHtml } from "@/lib/utils";
import type { UserComment } from "@/types";

/** A row in the profile Comments tab, Reddit comment-history style: the post
 *  title + author for context, then the comment text with a brand accent. Links
 *  to the post, deep-anchored to this comment. */
export function CommentCard({ comment }: { comment: UserComment }) {
  const { t } = useTranslation();
  const formatRelativeTime = useRelativeTime();
  return (
    <Link
      href={`/post/${comment.postId}#comment-${comment.id}`}
      className="block rounded-card border border-border-card bg-surface px-5 py-4 shadow-sm transition-colors hover:bg-surface-card"
    >
      <div className="flex items-start justify-between gap-3">
        <h3 className="line-clamp-1 text-sm font-semibold text-ink-secondary">
          {stripHtml(comment.postTitle)}
        </h3>
        <span className="shrink-0 text-xs text-ink-placeholder">
          {formatRelativeTime(comment.createdAt)}
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink-placeholder">
        {t("profile.commentByAuthor", { username: comment.postAuthorUsername })}
      </p>
      <p className="mt-2 line-clamp-3 border-l-2 border-primary pl-3 text-sm leading-relaxed text-ink">
        {stripHtml(comment.content)}
      </p>
    </Link>
  );
}
