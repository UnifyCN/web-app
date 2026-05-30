"use client";

import { useState } from "react";
import { Search, Users, CalendarDays, MessageCircle } from "lucide-react";
import { Tabs } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { GroupCard } from "@/components/community/GroupCard";
import { MyGroupsStrip } from "@/components/community/MyGroupsStrip";
import { EventCard } from "@/components/community/EventCard";
import { NewsArticleItem } from "@/components/community/NewsArticleItem";
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

const TAB_GROUPS = "Join Groups";
const TAB_EVENTS = "Community Events";
const TAB_NEWS = "News & Tips";
const TAB_CIRCLES = "Unify Circles";
const TABS = [TAB_GROUPS, TAB_EVENTS, TAB_NEWS, TAB_CIRCLES];

const CIRCLE_FEATURES = [
  {
    icon: Users,
    title: "Matching",
    description: "Get paired based on your own journey and background.",
  },
  {
    icon: CalendarDays,
    title: "2-Week Duration",
    description: "Fixed duration with icebreakers and prompts to keep it going.",
  },
  {
    icon: MessageCircle,
    title: "Group Chat",
    description: "Connect and share experiences in a safe space.",
  },
];

export default function CommunityPage() {
  const [activeTab, setActiveTab] = useState(TABS[0]);
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

  return (
    <div className="mx-auto max-w-[1080px] px-6 py-6">
      <h1 className="mb-5 text-center text-xl font-semibold text-ink-secondary">
        Community
      </h1>

      <Tabs tabs={TABS} activeTab={activeTab} onChange={setActiveTab} />

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
                placeholder="Search groups"
                aria-label="Search groups"
                className="h-10 w-full rounded-lg border border-border-card bg-surface pl-9 pr-3 text-sm text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
            </div>

            {search.trim() === "" && <MyGroupsStrip groups={joinedGroups} />}

            {groupsQuery.isLoading ? (
              <p className="py-12 text-center text-sm text-ink-muted">Loading…</p>
            ) : groupsQuery.error ? (
              <p
                role="alert"
                className="py-12 text-center text-sm text-destructive"
              >
                Couldn&apos;t load groups.
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
                  ? "No groups yet."
                  : "No groups match your search."}
              </p>
            )}

            <Button
              variant="secondary"
              className="w-full"
              onClick={() => setRequestOpen(true)}
            >
              Request a Group
            </Button>
          </div>
        )}

        {activeTab === TAB_EVENTS && (
          eventsQuery.isLoading ? (
            <p className="py-12 text-center text-sm text-ink-muted">Loading…</p>
          ) : eventsQuery.error ? (
            <p role="alert" className="py-12 text-center text-sm text-destructive">
              Couldn&apos;t load events.
            </p>
          ) : events.length > 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {events.map((event) => (
                <EventCard key={event.id} event={event} />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-ink-placeholder">
              No upcoming events.
            </p>
          )
        )}

        {activeTab === TAB_NEWS && (
          newsQuery.isLoading ? (
            <p className="py-12 text-center text-sm text-ink-muted">Loading…</p>
          ) : newsQuery.error ? (
            <p role="alert" className="py-12 text-center text-sm text-destructive">
              Couldn&apos;t load news.
            </p>
          ) : newsItems.length > 0 ? (
            <div className="divide-y divide-border-card rounded-card border border-border-card bg-surface px-4">
              {newsItems.map((item) => (
                <NewsArticleItem key={item.id} item={item} />
              ))}
            </div>
          ) : (
            <p className="py-12 text-center text-sm text-ink-placeholder">
              No news yet.
            </p>
          )
        )}

        {activeTab === TAB_CIRCLES && (
          <div className="max-w-2xl space-y-4">
            {circleQuery.isLoading ? (
              <p className="py-12 text-center text-sm text-ink-muted">
                Loading…
              </p>
            ) : circleQuery.error ? (
              <p
                role="alert"
                className="py-12 text-center text-sm text-destructive"
              >
                Couldn&apos;t load your circle.
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
                Couldn&apos;t update your matching status. Please try again.
              </p>
            )}

            <div className="space-y-4 rounded-card border border-border-card bg-surface p-5">
              {CIRCLE_FEATURES.map((feature) => {
                const Icon = feature.icon;
                return (
                  <div key={feature.title} className="flex gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-bg">
                      <Icon className="h-5 w-5 text-primary" aria-hidden />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-ink-secondary">
                        {feature.title}
                      </p>
                      <p className="mt-0.5 text-xs leading-relaxed text-ink-muted">
                        {feature.description}
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
