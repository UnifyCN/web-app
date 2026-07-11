"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { Tabs } from "@/components/ui/Tabs";
import { FeedTabs, FEED_TABS, type FeedTab } from "@/components/home/FeedTabs";
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

/** Empty-state copy per feed tab — i18n keys, translated at render. */
const FEED_EMPTY: Record<FeedTab, { titleKey: string; subKey: string }> = {
  forYou: {
    titleKey: "home.forYouEmptyTitle",
    subKey: "home.forYouEmptySub",
  },
  following: {
    titleKey: "home.noPostsFollowing",
    subKey: "home.notFollowingAnyone",
  },
  groups: {
    titleKey: "home.noGroupPosts",
    subKey: "home.notJoinedGroups",
  },
};

/** Phone-only section switcher (md+ shows all three at once). Stable ids —
 *  kept in state and compared against; labels translate only at render. */
const MOBILE_SECTIONS = ["feed", "news", "learning"] as const;
type MobileSection = (typeof MOBILE_SECTIONS)[number];

const MOBILE_SECTION_LABEL_KEYS: Record<MobileSection, string> = {
  feed: "home.sectionFeed",
  news: "home.sectionNews",
  learning: "home.sectionLearning",
};

export default function HomePage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<FeedTab>(FEED_TABS[0]);
  const [mobileSection, setMobileSection] = useState<MobileSection>(
    MOBILE_SECTIONS[0],
  );

  const forYou = useForYouFeed(activeTab === "forYou");
  const following = useFollowingFeed(activeTab === "following");
  const groups = useGroupsFeed(activeTab === "groups");

  const active =
    activeTab === "following" ? following : activeTab === "groups" ? groups : forYou;

  const posts = active.data?.pages.flatMap((p) => p.posts) ?? [];
  const { fetchNextPage, hasNextPage, isFetchingNextPage } = active;
  const sentinelRef = useRef<HTMLDivElement>(null);
  const empty = FEED_EMPTY[activeTab];

  // Take over scroll restoration while the feed is mounted — the browser's
  // native restore lands on a stale offset before the infinite pages re-fetch.
  // Revert to "auto" on unmount so other pages keep native behavior.
  useEffect(() => {
    window.history.scrollRestoration = "manual";
    return () => {
      window.history.scrollRestoration = "auto";
    };
  }, []);

  // Load the next page when the sentinel scrolls into view. The destructured
  // controls change identity when activeTab switches, so the observer re-binds
  // for the new tab automatically. rootMargin prefetches ~one screen early.
  useEffect(() => {
    const node = sentinelRef.current;
    if (!node || !hasNextPage) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          fetchNextPage();
        }
      },
      { rootMargin: "300px 0px" },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [fetchNextPage, hasNextPage, isFetchingNextPage]);

  return (
    <div className="mx-auto max-w-[1080px] animate-fade-in px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        {t("tabs.social")}
      </h1>

      {/* Phones stack Learning + News above the feed, pushing it far down the
          page — split the three into tabs so the feed is reachable. md+ keeps
          the full multi-column layout with every section visible. */}
      <div className="mb-5 md:hidden">
        {/* The shared Tabs primitive matches activeTab against the tabs array
            by string equality — pass translated labels for both and map the
            change back to the stable section id by index. */}
        <Tabs
          tabs={MOBILE_SECTIONS.map((section) =>
            t(MOBILE_SECTION_LABEL_KEYS[section]),
          )}
          activeTab={t(MOBILE_SECTION_LABEL_KEYS[mobileSection])}
          onChange={(label) => {
            const index = MOBILE_SECTIONS.findIndex(
              (section) => t(MOBILE_SECTION_LABEL_KEYS[section]) === label,
            );
            if (index >= 0) setMobileSection(MOBILE_SECTIONS[index]);
          }}
        />
      </div>

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start">
        {/* Feed — on phones only when the Feed tab is active; always shown md+ */}
        <section
          className={cn(
            "order-2 min-w-0 flex-1 md:block lg:order-1 lg:max-w-[680px]",
            mobileSection === "feed" ? "block" : "hidden",
          )}
        >
          <div className="overflow-hidden rounded-card border border-border-card bg-surface">
            <div className="px-3 pt-1">
              <FeedTabs activeTab={activeTab} onChange={setActiveTab} />
            </div>

            {activeTab === "groups" && (
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
            ) : active.error && posts.length === 0 ? (
              <div className="px-5 py-14 text-center">
                <p role="alert" className="text-sm text-destructive">
                  {t("home.feedLoadError")}
                </p>
              </div>
            ) : posts.length > 0 ? (
              <div className="animate-fade-in divide-y divide-border-card">
                {posts.map((post) => (
                  <PostCard key={post.id} post={post} />
                ))}

                {isFetchingNextPage && (
                  <>
                    <PostCardSkeleton />
                    <PostCardSkeleton withImage />
                  </>
                )}

                {hasNextPage ? (
                  <div ref={sentinelRef} aria-hidden className="h-px" />
                ) : (
                  <p className="px-5 py-8 text-center text-sm text-ink-placeholder">
                    {t("home.allCaughtUp")}
                  </p>
                )}
              </div>
            ) : (
              <div className="px-5 py-14 text-center">
                <p className="text-sm font-semibold text-ink-secondary">
                  {t(empty.titleKey)}
                </p>
                <p className="mx-auto mt-1 max-w-xs whitespace-pre-line text-sm text-ink-placeholder">
                  {t(empty.subKey)}
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
