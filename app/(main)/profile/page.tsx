"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Pencil } from "lucide-react";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import {
  ProfileTabs,
  PROFILE_TABS,
  type ProfileTabKey,
} from "@/components/profile/ProfileTabs";
import { HighlightCard } from "@/components/profile/HighlightCard";
import { CommentCard } from "@/components/profile/CommentCard";
import { SkeletonCommentList } from "@/components/profile/SkeletonCommentList";
import { PostCard } from "@/components/home/PostCard";
import { PostCardSkeleton } from "@/components/home/PostCardSkeleton";
import { useCurrentUser, useLessonHighlights } from "@/hooks/useProfile";
import { useSavedPosts, useUserComments, useUserPosts } from "@/hooks/useFeed";
import type { Post } from "@/types";

function TabMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
      {children}
    </p>
  );
}

/** Skeleton list of post cards in the same bordered container the real feed uses. */
function SkeletonPostList({ count = 3 }: { count?: number }) {
  return (
    <div className="divide-y divide-border-card overflow-hidden rounded-card border border-border-card bg-surface">
      {Array.from({ length: count }).map((_, i) => (
        <PostCardSkeleton key={i} />
      ))}
    </div>
  );
}

function PostFeed({
  items,
  isLoading,
  emptyText,
  emptyAction,
}: {
  items: Post[];
  isLoading: boolean;
  emptyText: string;
  emptyAction?: ReactNode;
}) {
  if (isLoading) return <SkeletonPostList />;
  if (items.length === 0) {
    return emptyAction ? (
      <div className="rounded-card border border-border-card bg-surface px-5 py-12 text-center">
        <p className="text-sm text-ink-placeholder">{emptyText}</p>
        <div className="mt-4 flex justify-center">{emptyAction}</div>
      </div>
    ) : (
      <TabMessage>{emptyText}</TabMessage>
    );
  }
  return (
    <div className="divide-y divide-border-card overflow-hidden rounded-card border border-border-card bg-surface">
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

/** Mirrors ProfileHeader's full layout (avatar + name + stats + persona/location
 *  + stage + bio + social + buttons) so there's no height jump on load. */
function ProfileHeaderSkeleton() {
  return (
    <div
      className="animate-pulse rounded-card border border-border-card bg-surface p-5"
      aria-hidden
    >
      <div className="flex items-start gap-4">
        <div className="h-20 w-20 shrink-0 rounded-full bg-surface-gray" />
        <div className="flex-1">
          <div className="h-5 w-40 rounded bg-surface-gray" />
          <div className="mt-3 flex gap-6">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i}>
                <div className="h-4 w-8 rounded bg-surface-gray" />
                <div className="mt-1 h-2.5 w-12 rounded bg-surface-gray" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Persona badge + location */}
      <div className="mt-3 flex items-center gap-2">
        <div className="h-5 w-24 rounded-full bg-surface-gray" />
        <div className="h-3 w-28 rounded bg-surface-gray" />
      </div>

      {/* Stage indicator */}
      <div className="mt-3 flex items-center gap-2">
        <div className="flex gap-1">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-1.5 w-5 rounded-full bg-surface-gray" />
          ))}
        </div>
        <div className="h-3 w-20 rounded bg-surface-gray" />
      </div>

      {/* Bio */}
      <div className="mt-3 space-y-2">
        <div className="h-3 w-full rounded bg-surface-gray" />
        <div className="h-3 w-2/3 rounded bg-surface-gray" />
      </div>

      {/* Social icons */}
      <div className="mt-3 flex gap-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-4 w-4 rounded bg-surface-gray" />
        ))}
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex gap-2">
        <div className="h-8 w-24 rounded-lg bg-surface-gray" />
        <div className="h-8 w-24 rounded-lg bg-surface-gray" />
      </div>
    </div>
  );
}

/** Skeleton list of highlight cards (matches HighlightCard shape). */
function SkeletonHighlightList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-card border border-border-card bg-surface p-4"
          aria-hidden
        >
          <div className="h-4 w-4 rounded bg-surface-gray" />
          <div className="mt-2 space-y-2">
            <div className="h-3 w-full rounded bg-surface-gray" />
            <div className="h-3 w-5/6 rounded bg-surface-gray" />
          </div>
          <div className="mt-3 h-2.5 w-1/2 rounded bg-surface-gray" />
        </div>
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const { t } = useTranslation();
  const [tab, setTab] = useState<ProfileTabKey>(PROFILE_TABS[0]);
  const { data: profile, isLoading } = useCurrentUser();

  const { data: myPosts, isLoading: postsLoading } = useUserPosts(
    profile?.id ?? "",
    { enabled: Boolean(profile?.id) },
  );
  const { data: savedPosts, isLoading: savedLoading } = useSavedPosts();
  const { data: comments, isLoading: commentsLoading } = useUserComments(
    profile?.id ?? "",
    { enabled: Boolean(profile?.id) },
  );
  const { data: highlights, isLoading: highlightsLoading } =
    useLessonHighlights();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[680px] animate-fade-in px-6 py-6">
        <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
          {t("profile.title")}
        </h1>
        <ProfileHeaderSkeleton />
        <div className="mt-5">
          <ProfileTabs activeTab={tab} onChange={setTab} />
        </div>
        <div className="mt-4">
          <SkeletonPostList />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center text-sm text-ink-placeholder">
        {t("profile.signInToView")}
      </div>
    );
  }

  const posts = myPosts ?? [];
  const saved = savedPosts ?? [];
  const commentItems = comments ?? [];
  const highlightItems = highlights ?? [];

  return (
    <div className="mx-auto max-w-[680px] animate-fade-in px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        {t("profile.title")}
      </h1>

      <ProfileHeader profile={profile} postCount={posts.length} isOwnProfile />

      <div className="mt-5">
        <ProfileTabs activeTab={tab} onChange={setTab} />
      </div>

      <div className="mt-4">
        {tab === "posts" && (
          <PostFeed
            items={posts}
            isLoading={postsLoading}
            emptyText={t("profile.shareFirstPost")}
            emptyAction={
              <Link
                href="/home"
                className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-4 text-sm font-semibold text-white transition-colors hover:bg-primary-dark"
              >
                <Pencil className="h-4 w-4" aria-hidden />
                {t("profile.sharePostCta")}
              </Link>
            }
          />
        )}
        {tab === "comments" &&
          (commentsLoading ? (
            <SkeletonCommentList />
          ) : commentItems.length > 0 ? (
            <div className="space-y-3">
              {commentItems.map((comment) => (
                <CommentCard key={comment.id} comment={comment} />
              ))}
            </div>
          ) : (
            <TabMessage>{t("profile.noCommentsSelfHint")}</TabMessage>
          ))}
        {tab === "saved" && (
          <PostFeed
            items={saved}
            isLoading={savedLoading}
            emptyText={t("profile.noSavedPosts")}
          />
        )}
        {tab === "highlights" &&
          (highlightsLoading ? (
            <SkeletonHighlightList />
          ) : highlightItems.length > 0 ? (
            <div className="space-y-3">
              {highlightItems.map((highlight) => (
                <HighlightCard key={highlight.id} highlight={highlight} />
              ))}
            </div>
          ) : (
            <TabMessage>{t("profile.noHighlights")}</TabMessage>
          ))}
      </div>
    </div>
  );
}
