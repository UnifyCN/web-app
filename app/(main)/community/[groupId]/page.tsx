"use client";

import { use, useState } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { GroupCover } from "@/components/community/GroupCover";
import { GroupMemberAvatarStack } from "@/components/community/GroupMemberAvatarStack";
import { PostCard } from "@/components/home/PostCard";
import { useGroup, useJoinGroup, useLeaveGroup } from "@/hooks/useCommunity";
import { useGroupPosts } from "@/hooks/useFeed";

export default function GroupDetailPage({
  params,
}: {
  params: Promise<{ groupId: string }>;
}) {
  const { groupId } = use(params);
  const parsedId = Number(groupId);
  const id = Number.isFinite(parsedId) && parsedId > 0 ? parsedId : 0;

  const groupQuery = useGroup(id);
  const groupPostsQuery = useGroupPosts(id);
  const joinMutation = useJoinGroup();
  const leaveMutation = useLeaveGroup();

  const group = groupQuery.data;
  const [joinedOverride, setJoinedOverride] = useState<boolean | null>(null);
  const joined = joinedOverride ?? group?.joinedByMe ?? false;

  if (groupQuery.isLoading) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">Loading…</p>
      </div>
    );
  }

  if (!group) {
    return (
      <div className="mx-auto max-w-[680px] px-6 py-16 text-center">
        <p className="text-sm text-ink-muted">This group could not be found.</p>
        <Link
          href="/community"
          className="mt-3 inline-block text-sm font-semibold text-primary"
        >
          Back to Community
        </Link>
      </div>
    );
  }

  const memberCount =
    group.memberCount + (joined ? 1 : 0) - (group.joinedByMe ? 1 : 0);
  const groupPosts = groupPostsQuery.data ?? [];

  function toggleJoin() {
    if (!group) return;
    if (joinMutation.isPending || leaveMutation.isPending) return;
    const wasJoined = joined;
    setJoinedOverride(!wasJoined);
    const mutation = wasJoined ? leaveMutation : joinMutation;
    mutation.mutate(group.id, {
      onSuccess: () => setJoinedOverride(null),
      onError: () => setJoinedOverride(wasJoined),
    });
  }

  return (
    <div className="mx-auto max-w-[680px] px-6 py-6">
      <Link
        href="/community"
        className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted transition-colors hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Community
      </Link>

      {/* Group header */}
      <div className="overflow-hidden rounded-card border border-border-card bg-surface">
        <div className="relative aspect-[3/1] w-full">
          <GroupCover
            coverPhotoUrl={group.coverPhotoUrl}
            sizes="680px"
            iconClassName="h-12 w-12 text-ink-placeholder"
          />
        </div>
        <div className="p-5">
          <h1 className="text-lg font-semibold text-ink-secondary">
            {group.groupName}
          </h1>
          <GroupMemberAvatarStack
            avatars={group.memberAvatars}
            totalCount={memberCount}
            className="mt-2"
          />
          <p className="mt-3 text-sm leading-relaxed text-ink-muted">
            {group.groupDescription}
          </p>
          <Button
            variant={joined ? "secondary" : "primary"}
            size="sm"
            className="mt-4"
            onClick={toggleJoin}
          >
            {joined ? "Joined" : "Join group"}
          </Button>
        </div>
      </div>

      {/* Group posts */}
      <h2 className="mb-2 mt-6 text-sm font-semibold text-ink-secondary">
        Recent posts
      </h2>
      {groupPostsQuery.isLoading ? (
        <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
          Loading posts…
        </p>
      ) : groupPosts.length > 0 ? (
        <div className="divide-y divide-border-card overflow-hidden rounded-card border border-border-card bg-surface">
          {groupPosts.map((post) => (
            <PostCard key={post.id} post={post} />
          ))}
        </div>
      ) : (
        <p className="rounded-card border border-border-card bg-surface px-5 py-12 text-center text-sm text-ink-placeholder">
          No posts in this group yet.
        </p>
      )}
    </div>
  );
}
