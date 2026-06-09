"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import {
  ProfileTabs,
  OTHER_PROFILE_TABS,
} from "@/components/profile/ProfileTabs";
import { CommentCard } from "@/components/profile/CommentCard";
import { PostCard } from "@/components/home/PostCard";
import { PostCardSkeleton } from "@/components/home/PostCardSkeleton";
import {
  useCurrentUser,
  useFollowsYou,
  useUserProfile,
} from "@/hooks/useProfile";
import { useUserComments, useUserPosts } from "@/hooks/useFeed";

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

/** Lightweight header placeholder while the profile loads. */
function HeaderSkeleton() {
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
      <div className="mt-4 h-8 w-24 rounded-lg bg-surface-gray" />
    </div>
  );
}

function EmptyMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
      {children}
    </p>
  );
}

export default function UserProfilePage() {
  const { userId } = useParams<{ userId: string }>();
  const [tab, setTab] = useState(OTHER_PROFILE_TABS[0]);

  const { data: currentUser } = useCurrentUser();
  const { data: profile, isLoading } = useUserProfile(userId);

  const isOwnProfile = Boolean(
    currentUser && profile && currentUser.id === profile.id,
  );

  const { data: userPosts, isLoading: postsLoading } = useUserPosts(userId, {
    enabled: Boolean(userId),
  });
  const { data: comments, isLoading: commentsLoading } = useUserComments(
    userId,
    { enabled: Boolean(userId) },
  );
  const { data: followsYou } = useFollowsYou(userId, {
    enabled: Boolean(userId) && !isOwnProfile,
  });

  if (isLoading) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-6">
        <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
          Profile
        </h1>
        <HeaderSkeleton />
        <div className="mt-6">
          <SkeletonPostList />
        </div>
      </div>
    );
  }

  if (!profile) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">This profile could not be found.</p>
        <Link
          href="/home"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to Home
        </Link>
      </div>
    );
  }

  const posts = userPosts ?? [];
  const commentItems = comments ?? [];

  return (
    <div className="mx-auto max-w-[680px] animate-fade-in px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        Profile
      </h1>

      <ProfileHeader
        profile={profile}
        postCount={posts.length}
        isOwnProfile={isOwnProfile}
        followsYou={Boolean(followsYou)}
      />

      <div className="mt-5">
        <ProfileTabs
          tabs={OTHER_PROFILE_TABS}
          activeTab={tab}
          onChange={setTab}
        />
      </div>

      <div className="mt-4">
        {tab === "Posts" &&
          (postsLoading ? (
            <SkeletonPostList />
          ) : posts.length > 0 ? (
            <div className="divide-y divide-border-card overflow-hidden rounded-card border border-border-card bg-surface">
              {posts.map((post) => (
                <PostCard key={post.id} post={post} />
              ))}
            </div>
          ) : (
            <EmptyMessage>No posts yet.</EmptyMessage>
          ))}

        {tab === "Comments" &&
          (commentsLoading ? (
            <SkeletonPostList />
          ) : commentItems.length > 0 ? (
            <div className="space-y-3">
              {commentItems.map((comment) => (
                <CommentCard key={comment.id} comment={comment} />
              ))}
            </div>
          ) : (
            <EmptyMessage>No comments yet.</EmptyMessage>
          ))}
      </div>
    </div>
  );
}
