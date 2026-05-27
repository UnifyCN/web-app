"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useJoinGroup, useLeaveGroup } from "@/hooks/useCommunity";
import type { Group } from "@/types";

/** Group card for the Community → Groups grid. Join state flips optimistically;
 *  rolls back on mutation error. */
export function GroupCard({ group }: { group: Group }) {
  const [joined, setJoined] = useState(group.joinedByMe);
  const joinMutation = useJoinGroup();
  const leaveMutation = useLeaveGroup();

  const memberCount =
    group.memberCount + (joined ? 1 : 0) - (group.joinedByMe ? 1 : 0);

  function toggleJoin() {
    const wasJoined = joined;
    setJoined(!wasJoined);
    const mutation = wasJoined ? leaveMutation : joinMutation;
    mutation.mutate(group.id, {
      onError: () => setJoined(wasJoined),
    });
  }

  return (
    <div className="flex flex-col overflow-hidden rounded-card border border-border-card bg-surface">
      <Link href={`/community/${group.id}`} className="block">
        <div className="relative aspect-[16/9] w-full">
          {group.coverPhotoUrl && (
            <Image
              src={group.coverPhotoUrl}
              alt=""
              fill
              className="object-cover"
              sizes="(max-width: 768px) 100vw, 320px"
            />
          )}
        </div>
      </Link>
      <div className="flex flex-1 flex-col p-4">
        <Link
          href={`/community/${group.id}`}
          className="text-sm font-semibold text-ink-secondary transition-colors hover:text-primary"
        >
          {group.groupName}
        </Link>
        <p className="mt-1 line-clamp-2 flex-1 text-xs leading-relaxed text-ink-muted">
          {group.groupDescription}
        </p>
        <div className="mt-3 flex items-center justify-between">
          <span className="flex items-center gap-1 text-xs text-ink-placeholder">
            <Users className="h-3.5 w-3.5" aria-hidden />
            {memberCount.toLocaleString("en-CA")} members
          </span>
          <Button
            variant={joined ? "secondary" : "primary"}
            size="sm"
            onClick={toggleJoin}
          >
            {joined ? "Joined" : "Join"}
          </Button>
        </div>
      </div>
    </div>
  );
}
