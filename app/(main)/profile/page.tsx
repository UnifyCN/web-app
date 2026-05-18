"use client";

import { useState } from "react";
import { ProfileHeader } from "@/components/profile/ProfileHeader";
import { ProfileTabs, PROFILE_TABS } from "@/components/profile/ProfileTabs";
import { HighlightCard } from "@/components/profile/HighlightCard";
import { PostCard } from "@/components/home/PostCard";
import { currentUser, lessonHighlights } from "@/lib/mock/users";
import { posts } from "@/lib/mock/posts";
import type { Post } from "@/types";

function PostFeed({ items, emptyText }: { items: Post[]; emptyText: string }) {
  if (items.length === 0) {
    return (
      <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
        {emptyText}
      </p>
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

export default function ProfilePage() {
  const [tab, setTab] = useState(PROFILE_TABS[0]);

  const myPosts = posts.filter((post) => post.author.id === currentUser.id);
  const savedPosts = posts.filter((post) => post.savedByMe);

  return (
    <div className="mx-auto max-w-[680px] px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        Profile
      </h1>

      <ProfileHeader
        profile={currentUser}
        postCount={myPosts.length}
        isOwnProfile
      />

      <div className="mt-5">
        <ProfileTabs activeTab={tab} onChange={setTab} />
      </div>

      <div className="mt-4">
        {tab === "Posts" && (
          <PostFeed items={myPosts} emptyText="You haven't posted yet." />
        )}
        {tab === "Saved" && (
          <PostFeed items={savedPosts} emptyText="No saved posts yet." />
        )}
        {tab === "Highlights" &&
          (lessonHighlights.length > 0 ? (
            <div className="space-y-3">
              {lessonHighlights.map((highlight) => (
                <HighlightCard key={highlight.id} highlight={highlight} />
              ))}
            </div>
          ) : (
            <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
              No highlights yet.
            </p>
          ))}
      </div>
    </div>
  );
}
