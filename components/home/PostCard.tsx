"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Heart, MessageCircle, Bookmark, Pin } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { ImageLightbox } from "@/components/ui/ImageLightbox";
import { useLikePost, useSavePost } from "@/hooks/useFeed";
import { cn, formatRelativeTime } from "@/lib/utils";
import type { Post } from "@/types";

/** A single feed post — header, body, optional images, and an action row.
 *  `linkToDetail` (default true) makes the title/body and the comment badge
 *  navigate to /post/[id]; the detail page itself passes false to avoid
 *  self-navigation. */
export function PostCard({
  post,
  linkToDetail = true,
}: {
  post: Post;
  linkToDetail?: boolean;
}) {
  const [liked, setLiked] = useState(post.likedByMe ?? false);
  const [saved, setSaved] = useState(post.savedByMe ?? false);
  const [popping, setPopping] = useState(false);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const likeMutation = useLikePost();
  const saveMutation = useSavePost();

  const likeCount =
    post.likeCount + (liked ? 1 : 0) - (post.likedByMe ? 1 : 0);
  // Bookmark is a pure personal toggle — no public save count is shown,
  // matching mobile's UX

  function toggleLike() {
    const wasLiked = liked;
    setLiked(!wasLiked);
    if (!wasLiked) {
      setPopping(true);
      window.setTimeout(() => setPopping(false), 220);
    }
    likeMutation.mutate(
      { postId: post.id, liked: wasLiked },
      { onError: () => setLiked(wasLiked) },
    );
  }

  function toggleSave() {
    const wasSaved = saved;
    setSaved(!wasSaved);
    saveMutation.mutate(
      { postId: post.id, saved: wasSaved },
      { onError: () => setSaved(wasSaved) },
    );
  }

  const hasImages = post.postImageUrls.length > 0;
  const multiImage = post.postImageUrls.length > 1;
  const detailHref = `/post/${post.id}`;
  const profileHref = `/profile/${post.author.id}`;

  const body = (
    <>
      {post.title && (
        <h3 className="text-base font-semibold text-ink-secondary group-hover:text-primary">
          {post.title}
        </h3>
      )}
      <p className="mt-1 text-sm leading-relaxed text-ink-muted">
        {post.content}
      </p>
    </>
  );

  return (
    <article className="px-5 py-4 transition-colors duration-200 hover:bg-surface-card">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href={profileHref}
          aria-label={`View ${post.author.username}'s profile`}
          className="shrink-0 rounded-full transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
        >
          <Avatar
            username={post.author.username}
            profilePictureUrl={post.author.profilePictureUrl}
            size={40}
          />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <Link
              href={profileHref}
              className="truncate text-sm font-semibold text-ink-secondary transition-colors hover:text-primary hover:underline"
            >
              {post.author.username}
            </Link>
            <span className="shrink-0 text-xs text-ink-placeholder">
              {formatRelativeTime(post.createdAt)}
            </span>
          </div>
          {post.groupName && <Badge className="mt-1">{post.groupName}</Badge>}
        </div>
        {post.isPinned && (
          <span className="flex shrink-0 items-center gap-1 text-xs font-medium text-primary">
            <Pin className="h-3.5 w-3.5" aria-hidden />
            Pinned
          </span>
        )}
      </div>

      {/* Body */}
      {linkToDetail ? (
        <Link href={detailHref} className="group mt-3 block">
          {body}
        </Link>
      ) : (
        <div className="mt-3">{body}</div>
      )}

      {/* Images */}
      {hasImages && (
        <div
          className={cn(
            "mt-3 grid gap-2",
            multiImage ? "grid-cols-2" : "grid-cols-1",
          )}
        >
          {post.postImageUrls.map((url, index) => (
            <button
              key={`${url}-${index}`}
              type="button"
              onClick={() => setLightboxIndex(index)}
              aria-label={`View image ${index + 1} full screen`}
              className="relative aspect-[4/3] cursor-zoom-in overflow-hidden rounded-lg border border-border"
            >
              <Image
                src={url}
                alt={`${post.title} — image ${index + 1}`}
                fill
                className="object-cover"
                sizes="(max-width: 680px) 100vw, 340px"
              />
            </button>
          ))}
        </div>
      )}

      {hasImages && (
        <ImageLightbox
          open={lightboxIndex !== null}
          images={post.postImageUrls}
          index={lightboxIndex ?? 0}
          onIndexChange={setLightboxIndex}
          onClose={() => setLightboxIndex(null)}
          alt={post.title}
        />
      )}

      {/* Actions */}
      <div className="mt-4 flex items-center gap-6">
        <button
          type="button"
          onClick={toggleLike}
          aria-pressed={liked}
          aria-label={liked ? "Unlike post" : "Like post"}
          className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <Heart
            className={cn(
              "h-5 w-5",
              popping && "animate-like-pop",
              liked && "fill-destructive text-destructive",
            )}
            aria-hidden
          />
          <span className={cn(liked && "text-destructive")}>{likeCount}</span>
        </button>

        {linkToDetail ? (
          <Link
            href={detailHref}
            aria-label="View comments"
            className="flex items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
          >
            <MessageCircle className="h-5 w-5" aria-hidden />
            {post.commentCount}
          </Link>
        ) : (
          <span className="flex items-center gap-1.5 text-sm text-ink-muted">
            <MessageCircle className="h-5 w-5" aria-hidden />
            {post.commentCount}
          </span>
        )}

        <button
          type="button"
          onClick={toggleSave}
          aria-pressed={saved}
          aria-label={saved ? "Remove from saved" : "Save post"}
          className="flex cursor-pointer items-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-ink"
        >
          <Bookmark
            className={cn(
              "h-5 w-5",
              saved && "fill-mention-blue text-mention-blue",
            )}
            aria-hidden
          />
        </button>
      </div>
    </article>
  );
}
