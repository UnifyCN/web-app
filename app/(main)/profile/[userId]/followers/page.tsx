"use client";

import { Suspense, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { ArrowLeft } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Tabs } from "@/components/ui/Tabs";
import { FollowButton } from "@/components/profile/FollowButton";
import {
  useCurrentUser,
  useFollowers,
  useFollowing,
  useUserProfile,
} from "@/hooks/useProfile";
import type { FollowListUser } from "@/types";

/** Stable (non-translated) tab identifiers — safe to keep in state. */
type FollowTabKey = "followers" | "following";

const TAB_KEYS: FollowTabKey[] = ["followers", "following"];

/** One row in the follow list — avatar + handle linking to the profile, plus a
 *  Follow button (hidden when the row is the signed-in user). */
function UserRow({ user, isSelf }: { user: FollowListUser; isSelf: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-lg px-2 py-3 transition-colors hover:bg-surface-gray">
      <Link
        href={`/profile/${user.id}`}
        className="flex min-w-0 flex-1 items-center gap-3"
      >
        <Avatar
          username={user.username}
          profilePictureUrl={user.profilePictureUrl}
          size={40}
        />
        <span className="truncate text-sm font-medium text-ink-secondary">
          @{user.username}
        </span>
      </Link>
      {!isSelf && <FollowButton userId={user.id} />}
    </div>
  );
}

function ListSkeleton() {
  return (
    <div className="space-y-1" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 px-2 py-3">
          <div className="h-10 w-10 shrink-0 rounded-full bg-surface-gray" />
          <div className="h-3 w-32 rounded bg-surface-gray" />
        </div>
      ))}
    </div>
  );
}

function FollowersFollowingContent() {
  const { t } = useTranslation();
  const { userId } = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const initialTab: FollowTabKey =
    searchParams.get("tab") === "following" ? "following" : "followers";

  const [tab, setTab] = useState<FollowTabKey>(initialTab);

  const { data: currentUser } = useCurrentUser();
  const { data: profile } = useUserProfile(userId);
  const followers = useFollowers(userId);
  const following = useFollowing(userId);

  const active = tab === "following" ? following : followers;
  const users = active.data ?? [];
  const title =
    profile?.onboarding?.firstName?.trim() ||
    (profile ? `@${profile.username}` : t("profile.title"));

  // The shared Tabs primitive compares by label string, so hand it translated
  // labels and map the change callback back to the stable key by index.
  const tabLabels = [t("profile.followersTab"), t("profile.followingTab")];

  return (
    <div className="mx-auto max-w-[680px] animate-fade-in px-6 py-6">
      <div className="mb-4 flex items-center gap-3">
        <Link
          href={`/profile/${userId}`}
          aria-label={t("profile.backToProfileAria")}
          className="flex h-8 w-8 items-center justify-center rounded-full text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
        </Link>
        <h1 className="truncate text-lg font-semibold text-ink-secondary">
          {title}
        </h1>
      </div>

      <Tabs
        tabs={tabLabels}
        activeTab={tab === "following" ? tabLabels[1] : tabLabels[0]}
        onChange={(label) => {
          const index = tabLabels.indexOf(label);
          if (index !== -1) setTab(TAB_KEYS[index]);
        }}
      />

      <div className="mt-4 space-y-1">
        {active.isLoading ? (
          <ListSkeleton />
        ) : users.length > 0 ? (
          users.map((user) => (
            <UserRow
              key={user.id}
              user={user}
              isSelf={currentUser?.id === user.id}
            />
          ))
        ) : (
          <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
            {tab === "following"
              ? t("profile.notFollowingAnyone")
              : t("profile.noFollowersYet")}
          </p>
        )}
      </div>
    </div>
  );
}

export default function FollowersFollowingPage() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto max-w-[680px] px-6 py-6">
          <ListSkeleton />
        </div>
      }
    >
      <FollowersFollowingContent />
    </Suspense>
  );
}
