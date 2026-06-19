"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";
import { Tabs } from "@/components/ui/Tabs";
import { FeedTabs, FEED_TABS } from "@/components/home/FeedTabs";
import { PostCard } from "@/components/home/PostCard";
import { PostCardSkeleton } from "@/components/home/PostCardSkeleton";
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

/** Phone-only section switcher (md+ shows all three at once). */
const MOBILE_SECTIONS = ["Feed", "News", "Learning"];

export default function HomePage() {
  const [activeTab, setActiveTab] = useState(FEED_TABS[0]);
  const [mobileSection, setMobileSection] = useState(MOBILE_SECTIONS[0]);

  const forYou = useForYouFeed(activeTab === "For You");
  const following = useFollowingFeed(activeTab === "Following");
  const groups = useGroupsFeed(activeTab === "Groups");

  const active =
    activeTab === "Following" ? following : activeTab === "Groups" ? groups : forYou;

  const posts = active.data?.posts ?? [];
  const empty = FEED_EMPTY[activeTab];

  return (
    <div className="mx-auto max-w-[1080px] animate-fade-in px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        Social
      </h1>

      {/* Phones stack Learning + News above the feed, pushing it far down the
          page — split the three into tabs so the feed is reachable. md+ keeps
          the full multi-column layout with every section visible. */}
      <div className="mb-5 md:hidden">
        <Tabs
          tabs={MOBILE_SECTIONS}
          activeTab={mobileSection}
          onChange={setMobileSection}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Feed — on phones only when the Feed tab is active; always shown md+ */}
        <section
          className={cn(
            "order-2 min-w-0 flex-1 md:block lg:order-1 lg:max-w-[680px]",
            mobileSection === "Feed" ? "block" : "hidden",
          )}
        >
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
              <div className="divide-y divide-border-card">
                <PostCardSkeleton withImage />
                <PostCardSkeleton />
                <PostCardSkeleton withImage />
                <PostCardSkeleton />
              </div>
            ) : active.error ? (
              <div className="px-5 py-14 text-center">
                <p role="alert" className="text-sm text-destructive">
                  Couldn&apos;t load the feed.
                </p>
              </div>
            ) : posts.length > 0 ? (
              <div className="animate-fade-in divide-y divide-border-card">
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
        <RightPanel mobileSection={mobileSection} />
      </div>

      <ComposeButton />
    </div>
  );
}
