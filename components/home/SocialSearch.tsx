"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useTranslation } from "react-i18next";
import { Search, SearchX, Users, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { Tabs } from "@/components/ui/Tabs";
import { GroupCover } from "@/components/community/GroupCover";
import { PostCard } from "@/components/home/PostCard";
import { PostCardSkeleton } from "@/components/home/PostCardSkeleton";
import { useSocialSearch } from "@/hooks/useSocialSearch";
import { trackSocialSearchPerformed } from "@/lib/analytics";
import { normalizeSearchTerm } from "@/lib/search";
import type { SocialSearchResults } from "@/services/search";

/**
 * Social search, ported from the mobile app's `app/search.tsx`: one bar that
 * finds posts, people and groups. Like mobile it runs on submit (Enter), not
 * per keystroke. Results show in Posts / People / Groups tabs in place of the
 * feed; clearing the bar (X or Escape) returns to the feed.
 */

export const SEARCH_TABS = ["posts", "people", "groups"] as const;
export type SearchTab = (typeof SEARCH_TABS)[number];

const TAB_LABEL_KEYS: Record<SearchTab, string> = {
  posts: "search.tabs.posts",
  people: "search.tabs.people",
  groups: "search.tabs.groups",
};

function countFor(results: SocialSearchResults, tab: SearchTab): number {
  return results[tab].length;
}

function firstNonEmptyTab(results: SocialSearchResults | undefined): SearchTab {
  if (!results) return "posts";
  return SEARCH_TABS.find((key) => countFor(results, key) > 0) ?? "posts";
}

/* ---- Bar --------------------------------------------------------------- */

export function SocialSearchBar({
  onSubmit,
  onClear,
}: {
  /** Called with the normalized term on Enter ("" never submits). */
  onSubmit: (term: string) => void;
  onClear: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  function clear() {
    setValue("");
    onClear();
    inputRef.current?.focus();
  }

  return (
    <form
      role="search"
      onSubmit={(event) => {
        event.preventDefault();
        const term = normalizeSearchTerm(value);
        if (term) onSubmit(term);
      }}
      className="relative"
    >
      <Search
        className="pointer-events-none absolute start-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder"
        aria-hidden
      />
      <input
        ref={inputRef}
        type="search"
        enterKeyHint="search"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && value) {
            event.preventDefault();
            clear();
          }
        }}
        placeholder={t("search.placeholder")}
        aria-label={t("search.placeholder")}
        maxLength={100}
        dir="auto"
        className={cn(
          "h-11 w-full rounded-full border border-border-card bg-surface ps-10 pe-12 text-sm text-ink",
          "placeholder:text-ink-placeholder",
          "focus:border-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/30",
          "[&::-webkit-search-cancel-button]:appearance-none",
        )}
      />
      {value && (
        <button
          type="button"
          onClick={clear}
          aria-label={t("search.clear")}
          title={t("search.clear")}
          // 44px hit area (the full height of the bar) around a filled 28px chip.
          className="group absolute end-0 top-0 flex h-11 w-11 cursor-pointer items-center justify-center rounded-full focus-visible:outline-none"
        >
          <span className="flex h-7 w-7 items-center justify-center rounded-full bg-surface-gray text-ink-secondary transition-colors group-hover:bg-surface-input group-hover:text-ink group-focus-visible:bg-surface-input group-focus-visible:text-ink group-focus-visible:ring-2 group-focus-visible:ring-primary">
            <X className="h-4 w-4" strokeWidth={2.5} aria-hidden />
          </span>
        </button>
      )}
    </form>
  );
}

/* ---- Results ----------------------------------------------------------- */

export function SocialSearchResults({ term }: { term: string }) {
  const { t } = useTranslation();
  const { data, isLoading, isError, refetch, isRefetching } =
    useSocialSearch(term);
  // The user's tab pick belongs to one set of results; new results open the
  // first tab that has anything (Posts → People → Groups) instead.
  const [picked, setPicked] = useState<{
    results: SocialSearchResults;
    tab: SearchTab;
  } | null>(null);
  const tab: SearchTab =
    picked && picked.results === data ? picked.tab : firstNonEmptyTab(data);

  // Record each new set of results with the tab it opens on. Keyed on the
  // results object, so a cached re-run of the same search also counts.
  useEffect(() => {
    if (!data) return;
    const first = firstNonEmptyTab(data);
    trackSocialSearchPerformed({
      tab: first,
      resultCount: countFor(data, first),
    });
  }, [data]);

  function selectTab(next: SearchTab) {
    if (next === tab || !data) return;
    setPicked({ results: data, tab: next });
    trackSocialSearchPerformed({
      tab: next,
      resultCount: countFor(data, next),
    });
  }

  const labels = SEARCH_TABS.map((key) =>
    data
      ? t("search.tabWithCount", {
          label: t(TAB_LABEL_KEYS[key]),
          count: countFor(data, key),
        })
      : t(TAB_LABEL_KEYS[key]),
  );

  return (
    <section
      aria-label={t("search.resultsFor", { term })}
      className="overflow-hidden rounded-card border border-border-card bg-surface"
    >
      <h2 className="px-5 pt-4 text-sm font-semibold text-ink-secondary">
        <bdi>{t("search.resultsFor", { term })}</bdi>
      </h2>
      <div className="px-3">
        <Tabs
          tabs={labels}
          activeTab={labels[SEARCH_TABS.indexOf(tab)]}
          onChange={(_, index) => selectTab(SEARCH_TABS[index])}
          className="scrollbar-none overflow-x-auto [&>button]:flex-1 [&>button]:whitespace-nowrap [&>button]:px-2 sm:[&>button]:flex-none sm:[&>button]:px-5"
        />
      </div>

      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading ? (
          <div className="divide-y divide-border-card">
            <PostCardSkeleton />
            <PostCardSkeleton />
            <PostCardSkeleton />
          </div>
        ) : isError || !data ? (
          <div className="px-5 py-14 text-center">
            <p role="alert" className="text-sm text-destructive">
              {t("search.error")}
            </p>
            <Button
              variant="secondary"
              size="sm"
              className="mt-3"
              loading={isRefetching}
              onClick={() => void refetch()}
            >
              {t("common.retry")}
            </Button>
          </div>
        ) : countFor(data, tab) === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <SearchX className="h-8 w-8 text-ink-placeholder" aria-hidden />
            <p className="mt-2 text-sm text-ink-muted">
              {t("search.noResults")}
            </p>
          </div>
        ) : tab === "posts" ? (
          <div className="animate-fade-in divide-y divide-border-card">
            {data.posts.map((post) => (
              <PostCard key={post.id} post={post} />
            ))}
          </div>
        ) : tab === "people" ? (
          <ul className="animate-fade-in divide-y divide-border-card">
            {data.people.map((person) => (
              <li key={person.id}>
                <Link
                  href={`/profile/${person.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-gray focus-visible:bg-surface-gray focus-visible:outline-none"
                >
                  <Avatar
                    profilePictureUrl={person.profilePictureUrl}
                    username={person.username}
                    size={40}
                  />
                  <span className="min-w-0">
                    <bdi className="block truncate text-sm font-semibold text-ink-secondary">
                      {person.username}
                    </bdi>
                    {person.firstName && (
                      <bdi className="block truncate text-xs text-ink-placeholder">
                        {person.firstName}
                      </bdi>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="animate-fade-in divide-y divide-border-card">
            {data.groups.map((group) => (
              <li key={group.id}>
                <Link
                  href={`/community/${group.id}`}
                  className="flex items-center gap-3 px-5 py-3 transition-colors hover:bg-surface-gray focus-visible:bg-surface-gray focus-visible:outline-none"
                >
                  <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-lg bg-surface-gray">
                    <GroupCover
                      coverPhotoUrl={group.coverPhotoUrl}
                      sizes="48px"
                      iconClassName="h-5 w-5 text-ink-placeholder"
                    />
                  </span>
                  <span className="min-w-0 flex-1">
                    <bdi className="block truncate text-sm font-semibold text-ink-secondary">
                      {group.groupName}
                    </bdi>
                    {group.groupDescription && (
                      <bdi className="block truncate text-xs text-ink-muted">
                        {group.groupDescription}
                      </bdi>
                    )}
                    <span className="mt-0.5 flex items-center gap-1 text-xs text-ink-placeholder">
                      <Users className="h-3.5 w-3.5" aria-hidden />
                      {t("common.memberCount", { count: group.memberCount })}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
