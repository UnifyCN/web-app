"use client";

import { useState } from "react";
import { Search, Users, CalendarDays, MessageCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { GroupCard } from "@/components/community/GroupCard";
import { MyGroupsStrip } from "@/components/community/MyGroupsStrip";
import { EventCard } from "@/components/community/EventCard";
import { NewsArticleItem } from "@/components/community/NewsArticleItem";
import { DailyTipCard } from "@/components/community/DailyTipCard";
import { CirclesEntryCard } from "@/components/community/CirclesEntryCard";
import { RequestGroupModal } from "@/components/community/RequestGroupModal";
import {
  useCancelCircleMatching,
  useCurrentCircle,
  useEvents,
  useGroups,
  useJoinedGroups,
  useNews,
  useStartCircleMatching,
} from "@/hooks/useCommunity";

const TAB_GROUPS = "groups";
const TAB_EVENTS = "events";
const TAB_NEWS = "news";
const TAB_CIRCLES = "circles";
// Stable tab keys stay in state; labels are translated at render time.
// Circles is hidden for now — re-enable by adding the circles entry back to this array.
// The TAB_CIRCLES constant, CIRCLE_FEATURES, hooks, and render block below are left intact.
const TAB_DEFS: { key: string; labelKey: string }[] = [
  { key: TAB_GROUPS, labelKey: "groups.joinGroups" },
  { key: TAB_EVENTS, labelKey: "events.title" },
  { key: TAB_NEWS, labelKey: "news.title" },
];

const CIRCLE_FEATURES = [
  {
    icon: Users,
    titleKey: "circles.matching",
    descriptionKey: "circles.matchingDesc",
  },
  {
    icon: CalendarDays,
    titleKey: "circles.twoWeekDuration",
    descriptionKey: "circles.twoWeekDesc",
  },
  {
    icon: MessageCircle,
    titleKey: "circles.groupChat",
    descriptionKey: "circles.groupChatDesc",
  },
];

/** Loading placeholder for the Events grid (mirrors EventCard). */
function EventsSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: 6 }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse overflow-hidden rounded-card border border-border-card bg-surface"
          aria-hidden
        >
          <div className="aspect-[16/9] w-full bg-surface-gray" />
          <div className="p-4">
            <div className="h-4 w-2/3 rounded bg-surface-gray" />
            <div className="mt-1.5 h-5 w-20 rounded-full bg-surface-gray" />
            <div className="mt-2.5 space-y-1.5">
              <div className="h-3 w-5/6 rounded bg-surface-gray" />
              <div className="h-3 w-1/2 rounded bg-surface-gray" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Loading placeholder for the "My Groups" horizontal strip. */
function MyGroupsStripSkeleton() {
  return (
    <div className="animate-pulse" aria-hidden>
      <div className="mb-2 h-4 w-24 rounded bg-surface-gray" />
      <div className="flex gap-3 overflow-x-auto pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-card border border-border-card bg-surface p-3"
          >
            <div className="h-14 w-14 rounded-full bg-surface-gray" />
            <div className="h-3 w-20 rounded bg-surface-gray" />
          </div>
        ))}
      </div>
    </div>
  );
}

export default function CommunityPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState(TAB_DEFS[0].key);
  const [search, setSearch] = useState("");
  const [requestOpen, setRequestOpen] = useState(false);

  const groupsQuery = useGroups();
  const joinedGroupsQuery = useJoinedGroups();
  const eventsQuery = useEvents();
  const newsQuery = useNews();
  const circleQuery = useCurrentCircle();
  const startMatching = useStartCircleMatching();
  const cancelMatching = useCancelCircleMatching();

  const groups = groupsQuery.data ?? [];
  const joinedGroups = joinedGroupsQuery.data ?? [];
  const events = eventsQuery.data ?? [];
  const newsItems = newsQuery.data ?? [];

  const filteredGroups = groups.filter((group) =>
    group.groupName.toLowerCase().includes(search.trim().toLowerCase()),
  );

  // The shared Tabs primitive compares labels by string equality, so pass the
  // translated labels and map the change back to the stable key via the index
  // (translated labels may not be unique).
  const tabLabels = TAB_DEFS.map((tab) => t(tab.labelKey));
  const activeTabLabel =
    tabLabels[TAB_DEFS.findIndex((tab) => tab.key === activeTab)] ??
    tabLabels[0];

  return (
    <div className="mx-auto max-w-[1080px] animate-fade-in px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        {t("tabs.community")}
      </h1>

      <Tabs
        tabs={tabLabels}
        activeTab={activeTabLabel}
        onChange={(_, index) => setActiveTab(TAB_DEFS[index].key)}
      />

      <div className="mt-6">
        {activeTab === TAB_GROUPS && (
          <div className="space-y-6">
            <div className="relative">
              <Search
                className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-placeholder"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("groups.searchGroups")}
                aria-label={t("groups.searchGroups")}
                className="h-10 w-full rounded-lg border border-border-card bg-surface pl-9 pr-3 text-base text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            {search.trim() === "" &&
              (joinedGroupsQuery.isLoading ? (
                <MyGroupsStripSkeleton />
              ) : (
                <MyGroupsStrip groups={joinedGroups} />
              ))}

            {groupsQuery.isLoading ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div
                    key={i}
                    className="animate-pulse overflow-hidden rounded-card border border-border-card bg-surface"
                    aria-hidden
                  >
                    <div className="aspect-[16/9] w-full bg-surface-gray" />
                    <div className="p-4">
                      <div className="h-4 w-2/3 rounded bg-surface-gray" />
                      <div className="mt-2 space-y-1.5">
                        <div className="h-3 w-full rounded bg-surface-gray" />
                        <div className="h-3 w-5/6 rounded bg-surface-gray" />
                      </div>
                      <div className="mt-3 flex items-center justify-between">
                        <div className="h-3 w-20 rounded bg-surface-gray" />
                        <div className="h-8 w-14 rounded-lg bg-surface-gray" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : groupsQuery.error ? (
              <p
                role="alert"
                className="py-12 text-center text-sm text-destructive"
              >
                {t("groups.failedLoad")}
              </p>
            ) : filteredGroups.length > 0 ? (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {filteredGroups.map((group) => (
                  <GroupCard key={group.id} group={group} />
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-ink-placeholder">
                {search.trim() === ""
                  ? t("groups.noGroupsYet")
                  : t("groups.noGroupsMatch")}
              </p>
            )}

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setRequestOpen(true)}
            >
              {t("groups.requestGroup")}
            </Button>
          </div>
        )}

        {activeTab === TAB_EVENTS && (
          eventsQuery.isLoading ? (
            <EventsSkeleton />
          ) : eventsQuery.error ? (
            <p role="alert" className="py-12 text-center text-sm text-destructive">
              {t("events.failedLoad")}
            </p>
          ) : events.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-ink-placeholder">
              {t("events.noUpcoming")}
            </p>
          )
        )}

        {activeTab === TAB_NEWS && (
          <div className="space-y-4">
            <DailyTipCard />
            {newsQuery.isLoading ? (
              <div className="divide-y divide-border-card rounded-card border border-border-card bg-surface px-4">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="flex animate-pulse gap-4 py-4"
                    aria-hidden
                  >
                    <div className="h-20 w-20 shrink-0 rounded-lg bg-surface-gray sm:h-24 sm:w-24" />
                    <div className="min-w-0 flex-1">
                      <div className="h-4 w-16 rounded-full bg-surface-gray" />
                      <div className="mt-2 h-3.5 w-3/4 rounded bg-surface-gray" />
                      <div className="mt-2 space-y-1.5">
                        <div className="h-3 w-full rounded bg-surface-gray" />
                        <div className="h-3 w-5/6 rounded bg-surface-gray" />
                      </div>
                      <div className="mt-2 h-2.5 w-24 rounded bg-surface-gray" />
                    </div>
                  </div>
                ))}
              </div>
            ) : newsQuery.error ? (
              <p
                role="alert"
                className="py-12 text-center text-sm text-destructive"
              >
                {t("news.loadError")}
              </p>
            ) : newsItems.length > 0 ? (
              <div className="divide-y divide-border-card rounded-card border border-border-card bg-surface px-4">
                {newsItems.map((item) => (
                  <NewsArticleItem key={item.id} item={item} />
                ))}
              </div>
            ) : (
              <p className="py-12 text-center text-sm text-ink-placeholder">
                {t("news.noNews")}
              </p>
            )}
          </div>
        )}

        {activeTab === TAB_CIRCLES && (
          <div className="max-w-2xl space-y-4">
            {circleQuery.isLoading ? (
              <p className="py-12 text-center text-sm text-ink-muted">
                {t("common.loading")}
              </p>
            ) : circleQuery.error ? (
              <p
                role="alert"
                className="py-12 text-center text-sm text-destructive"
              >
                {t("circles.failedLoad")}
              </p>
            ) : (
              <CirclesEntryCard
                status={circleQuery.data?.status ?? "default"}
                onStart={() => startMatching.mutate()}
                onCancel={() => cancelMatching.mutate()}
                isPending={startMatching.isPending || cancelMatching.isPending}
              />
            )}

            {(startMatching.error || cancelMatching.error) && (
              <p role="alert" className="text-sm text-destructive">
                {t("circles.updateMatchingFailed")}
              </p>
            )}

            <div className="space-y-4 rounded-card border border-border-card bg-surface p-5">
              {CIRCLE_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.titleKey} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-secondary">
                        {t(feature.titleKey)}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                        {t(feature.descriptionKey)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      <RequestGroupModal
        open={requestOpen}
        onClose={() => setRequestOpen(false)}
      />
    </div>
  );
}
