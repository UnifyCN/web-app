"use client";

import { use, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Trash2 } from "lucide-react";
import { PostCard } from "@/components/home/PostCard";
import { CommentComposer } from "@/components/home/CommentComposer";
import { PostCommentItem } from "@/components/home/PostCommentItem";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  useComments,
  useCreateComment,
  useDeletePost,
  usePost,
} from "@/hooks/useFeed";
import { useCurrentUser } from "@/hooks/useProfile";
import type { PostComment } from "@/types";

export default function PostDetailPage({
  params,
}: {
  params: Promise<{ postId: string }>;
}) {
  const { postId } = use(params);
  const parsedId = Number(postId);
  // Integer ids only — reject fractional (/post/3.5) and non-numeric ids.
  const id = Number.isInteger(parsedId) && parsedId > 0 ? parsedId : 0;

  const { t } = useTranslation();
  const router = useRouter();
  const postQuery = usePost(id);
  const commentsQuery = useComments(id);
  const currentUser = useCurrentUser().data;
  const createComment = useCreateComment();
  const deletePost = useDeletePost();

  const [replyTarget, setReplyTarget] = useState<PostComment | null>(null);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
  // Boolean flag (not the message itself) so the copy re-resolves on language
  // switch instead of a stale translated string living in state.
  const [deleteError, setDeleteError] = useState(false);

  const post = postQuery.data;

  // Group flat comments into top-level + replies-by-parent. Comments arrive
  // oldest-first, so each thread's replies stay chronological.
  const { topLevel, repliesByParent } = useMemo(() => {
    const comments = commentsQuery.data ?? [];
    const top: PostComment[] = [];
    const replies = new Map<number, PostComment[]>();
    for (const comment of comments) {
      if (comment.parentCommentId == null) {
        top.push(comment);
      } else {
        const arr = replies.get(comment.parentCommentId) ?? [];
        arr.push(comment);
        replies.set(comment.parentCommentId, arr);
      }
    }
    return { topLevel: top, repliesByParent: replies };
  }, [commentsQuery.data]);

  // Deep-link: once comments are in the DOM, scroll the #comment-<id> target
  // (e.g. from a profile Comments card) into view. Runs once via a ref so later
  // data changes don't re-scroll.
  const scrolledRef = useRef(false);
  useEffect(() => {
    if (scrolledRef.current) return;
    if (!commentsQuery.data || commentsQuery.data.length === 0) return;
    const hash = window.location.hash;
    if (!hash.startsWith("#comment-")) return;
    const el = document.getElementById(hash.slice(1));
    if (!el) return;
    scrolledRef.current = true;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [commentsQuery.data]);

  async function handleSubmit(content: string) {
    await createComment.mutateAsync({
      postId: id,
      content,
      parentCommentId: replyTarget?.id ?? null,
    });
    setReplyTarget(null);
  }

  function confirmDeletePost() {
    if (!post || deletePost.isPending) return;
    setDeleteError(false);
    deletePost.mutate(post.id, {
      onSuccess: () => router.push("/home"),
      onError: () => {
        setDeleteError(true);
        setConfirmDeleteOpen(false);
      },
    });
  }

  if (postQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">{t("common.loading")}</p>
      </div>
    );
  }

  if (postQuery.isError) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">{t("posts.loadPostError")}</p>
        <button
          type="button"
          onClick={() => postQuery.refetch()}
          className="mt-3 inline-block cursor-pointer text-sm font-semibold text-primary"
        >
          {t("common.retry")}
        </button>
      </div>
    );
  }

  if (!post) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">{t("posts.postNotFound")}</p>
        <Link
          href="/home"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          {t("common.backToHome")}
        </Link>
      </div>
    );
  }

  const isOwnPost = currentUser != null && post.userId === currentUser.id;
  const commentCount = commentsQuery.data?.length ?? 0;

  return (
    <div className="mx-auto max-w-[680px] animate-fade-in px-6 py-6">
      <div className="mb-4 flex items-center justify-between">
        <Link
          href="/home"
          className="inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden />
          {t("common.home")}
        </Link>
        {isOwnPost && (
          <button
            type="button"
            onClick={() => {
              setDeleteError(false);
              setConfirmDeleteOpen(true);
            }}
            disabled={deletePost.isPending}
            className="inline-flex cursor-pointer items-center gap-1 text-sm text-ink-muted transition-colors hover:text-destructive disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Trash2 className="h-4 w-4" aria-hidden />
            {t("home.deletePost")}
          </button>
        )}
      </div>

      {deleteError && (
        <p className="mb-4 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {t("posts.deletePostError")}
        </p>
      )}

      {/* Post */}
      <div className="overflow-hidden rounded-card border border-border bg-surface">
        <PostCard post={post} linkToDetail={false} />
      </div>

      {/* Composer */}
      <div className="mt-6">
        <CommentComposer
          currentUser={currentUser}
          pending={createComment.isPending}
          replyingTo={
            replyTarget ? { username: replyTarget.author.username } : null
          }
          onCancelReply={() => setReplyTarget(null)}
          placeholder={
            replyTarget
              ? t("posts.writeReplyPlaceholder")
              : t("posts.addCommentPlaceholder")
          }
          onSubmit={handleSubmit}
        />
      </div>

      {/* Comments */}
      <h2 className="mb-3 mt-6 text-sm font-semibold text-ink-secondary">
        {commentCount > 0
          ? t("posts.commentCount", { count: commentCount })
          : t("profile.comments")}
      </h2>

      {commentsQuery.isLoading ? (
        <p className="py-8 text-center text-sm text-ink-muted">
          {t("posts.loadingComments")}
        </p>
      ) : commentsQuery.isError ? (
        <div className="rounded-card border border-border bg-surface px-5 py-10 text-center">
          <p className="text-sm text-ink-muted">
            {t("posts.loadCommentsError")}
          </p>
          <button
            type="button"
            onClick={() => commentsQuery.refetch()}
            className="mt-2 cursor-pointer text-sm font-semibold text-primary"
          >
            {t("common.retry")}
          </button>
        </div>
      ) : topLevel.length > 0 ? (
        <div className="space-y-5">
          {topLevel.map((comment) => (
            <PostCommentItem
              key={comment.id}
              comment={comment}
              postId={id}
              currentUserId={currentUser?.id}
              replies={repliesByParent.get(comment.id) ?? []}
              onReply={setReplyTarget}
            />
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-border bg-surface px-5 py-10 text-center text-sm text-ink-placeholder">
          {t("home.beFirstComment")}
        </p>
      )}

      <ConfirmModal
        open={confirmDeleteOpen}
        title={t("posts.deletePostTitle")}
        description={t("home.confirmDeletePost")}
        confirmLabel={t("common.delete")}
        isPending={deletePost.isPending}
        onConfirm={confirmDeletePost}
        onCancel={() => setConfirmDeleteOpen(false)}
      />
    </div>
  );
}
