"use client";

import { useState, type ReactNode } from "react";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs, PROFILE_TABS } from "@/components/profile/ProfileTabs";
import { HighlightCard } from "@/components/profile/HighlightCard";
import { PostCard } from "@/components/home/PostCard";
import { useCurrentUser, useLessonHighlights } from "@/hooks/useProfile";
import { useSavedPosts, useUserPosts } from "@/hooks/useFeed";
import type { Post } from "@/types";

function TabMessage({ children }: { children: ReactNode }) {
  return (
    <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
      {children}
    </p>
  );
}

function PostFeed({
  items,
  isLoading,
  emptyText,
}: {
  items: Post[];
  isLoading: boolean;
  emptyText: string;
}) {
  if (isLoading) return <TabMessage>Loading…</TabMessage>;
  if (items.length === 0) return <TabMessage>{emptyText}</TabMessage>;
  return (
    <div className="divide-y divide-border-card overflow-hidden rounded-card border border-border-card bg-surface">
      {items.map((post) => (
        <PostCard key={post.id} post={post} />
      ))}
    </div>
  );
}

export default function ProfilePage() {
  const [tab, setTab] = useState(PROFILE_TABS[0]);
  const { data: profile, isLoading } = useCurrentUser();

  const { data: myPosts, isLoading: postsLoading } = useUserPosts(
    profile?.id ?? "",
    { enabled: Boolean(profile?.id) },
  );
  const { data: savedPosts, isLoading: savedLoading } = useSavedPosts();
  const { data: highlights, isLoading: highlightsLoading } =
    useLessonHighlights();

  if (isLoading || !profile) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center text-sm text-ink-placeholder">
        {isLoading ? "Loading your profile…" : "Sign in to view your profile."}
      </div>
    );
  }

  const posts = myPosts ?? [];
  const saved = savedPosts ?? [];
  const highlightItems = highlights ?? [];

  return (
    <div className="mx-auto max-w-[680px] px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        Profile
      </h1>

      <ProfileHeader profile={profile} postCount={posts.length} isOwnProfile />

      <div className="mt-5">
        <ProfileTabs activeTab={tab} onChange={setTab} />
      </div>

      <div className="mt-4">
        {tab === "Posts" && (
          <PostFeed
            items={posts}
            isLoading={postsLoading}
            emptyText="You haven't posted yet."
          />
        )}
        {tab === "Saved" && (
          <PostFeed
            items={saved}
            isLoading={savedLoading}
            emptyText="No saved posts yet."
          />
        )}
        {tab === "Highlights" &&
          (highlightsLoading ? (
            <TabMessage>Loading…</TabMessage>
          ) : highlightItems.length > 0 ? (
            <div className="space-y-3">
              {highlightItems.map((highlight) => (
                <HighlightCard key={highlight.id} highlight={highlight} />
              ))}
            </div>
          ) : (
            <TabMessage>No highlights yet.</TabMessage>
          ))}
      </div>
    </div>
  );
}
