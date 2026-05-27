"use client";

import { useState } from "react";
import { FeedTabs, FEED_TABS } from "@/components/home/FeedTabs";
import { PostCard } from "@/components/home/PostCard";
import { ComposeButton } from "@/components/home/ComposeButton";
import { RightPanel } from "@/components/home/RightPanel";
import { JoinGroupsCard } from "@/components/home/JoinGroupsCard";
import {
  useFollowingFeed,
  useForYouFeed,
  useGroupsFeed,
} from "@/hooks/useFeed";

const FEED_EMPTY: Record<string, { title: string; sub: string }> = {
  "For You": {
    title: "No posts yet",
    sub: "Check back soon for new posts.",
  },
  Following: {
    title: "No posts here…",
    sub: "You haven't followed anyone yet. Follow other members to see their posts.",
  },
  Groups: {
    title: "No group posts here…",
    sub: "Join a group to see posts from it.",
  },
};

export default function HomePage() {
  const [activeTab, setActiveTab] = useState(FEED_TABS[0]);

  const forYou = useForYouFeed();
  const following = useFollowingFeed();
  const groups = useGroupsFeed();

  const active =
    activeTab === "Following" ? following : activeTab === "Groups" ? groups : forYou;

  const posts = active.data?.posts ?? [];
  const empty = FEED_EMPTY[activeTab];

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        Home
      </h1>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Feed */}
        <section className="order-2 min-w-0 flex-1 lg:order-1 lg:max-w-[680px]">
          <div className="overflow-hidden rounded-card border border-border-card bg-surface">
            <div className="px-3 pt-1">
              <FeedTabs activeTab={activeTab} onChange={setActiveTab} />
            </div>

            {activeTab === "Groups" && (
              <div className="px-4 pt-4">
                <JoinGroupsCard />
              </div>
            )}

            {active.isLoading ? (
              <div className="px-5 py-14 text-center">
                <p className="text-sm text-ink-muted">Loading…</p>
              </div>
            ) : active.error ? (
              <div className="px-5 py-14 text-center">
                <p role="alert" className="text-sm text-destructive">
                  Couldn&apos;t load the feed.
                </p>
              </div>
            ) : posts.length > 0 ? (
              <div className="divide-y divide-border-card">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}
              </div>
            ) : (
              <div className="px-5 py-14 text-center">
                <p className="text-sm font-semibold text-ink-secondary">
                  {empty.title}
                </p>
                <p className="mx-auto mt-1 max-w-xs text-sm text-ink-placeholder">
                  {empty.sub}
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Right-hand widgets */}
        <RightPanel />
      </div>

      <ComposeButton />
    </div>
  );
}
