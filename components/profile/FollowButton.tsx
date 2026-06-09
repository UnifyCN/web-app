"use client";

import { Button } from "@/components/ui/Button";
import {
  useFollowStatus,
  useFollowUser,
  useUnfollowUser,
} from "@/hooks/useProfile";

interface FollowButtonProps {
  /** The user to follow / unfollow. */
  userId: string;
  className?: string;
}

/**
 * Follow / Following toggle backed by the real `user_followers` graph. Reads the
 * current state with useFollowStatus; the follow / unfollow mutations write the
 * new value into that query's cache optimistically (and roll back on error), so
 * the label flips instantly without any local state. Shared by the profile
 * header and the followers / following list rows.
 */
export function FollowButton({ userId, className }: FollowButtonProps) {
  const { data: isFollowing = false, isLoading } = useFollowStatus(userId);
  const followUser = useFollowUser();
  const unfollowUser = useUnfollowUser();
  const pending = followUser.isPending || unfollowUser.isPending || isLoading;

  const handleToggle = () => {
    if (isFollowing) unfollowUser.mutate(userId);
    else followUser.mutate(userId);
  };

  return (
    <Button
      variant={isFollowing ? "secondary" : "primary"}
      size="sm"
      disabled={pending}
      onClick={handleToggle}
      className={className}
    >
      {isFollowing ? "Following" : "Follow"}
    </Button>
  );
}
