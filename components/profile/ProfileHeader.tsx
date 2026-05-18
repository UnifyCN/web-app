"use client";

import { useState } from "react";
import { MapPin } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatsRow } from "./StatsRow";
import { PersonaBadge } from "./PersonaBadge";
import { StageIndicator } from "./StageIndicator";
import type { UserProfile } from "@/types";

/* lucide-react no longer ships brand glyphs — inline minimal ones. */
function InstagramIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M12 2c2.717 0 3.056.01 4.122.06 1.065.05 1.79.217 2.428.465.66.254 1.216.598 1.772 1.153.509.5.902 1.105 1.153 1.772.247.637.415 1.363.465 2.428.047 1.066.06 1.405.06 4.122 0 2.717-.01 3.056-.06 4.122-.05 1.065-.218 1.79-.465 2.428a4.883 4.883 0 0 1-1.153 1.772c-.5.508-1.105.902-1.772 1.153-.637.247-1.363.415-2.428.465-1.066.047-1.405.06-4.122.06-2.717 0-3.056-.01-4.122-.06-1.065-.05-1.79-.218-2.428-.465a4.89 4.89 0 0 1-1.772-1.153 4.904 4.904 0 0 1-1.153-1.772c-.248-.637-.415-1.363-.465-2.428C2.013 15.056 2 14.717 2 12c0-2.717.01-3.056.06-4.122.05-1.066.217-1.79.465-2.428a4.88 4.88 0 0 1 1.153-1.772A4.897 4.897 0 0 1 5.45 2.525c.638-.248 1.362-.415 2.428-.465C8.944 2.013 9.283 2 12 2zm0 3.838a6.162 6.162 0 1 0 0 12.324 6.162 6.162 0 0 0 0-12.324zM12 16a4 4 0 1 1 0-8 4 4 0 0 1 0 8zm6.406-11.845a1.44 1.44 0 1 0 0 2.88 1.44 1.44 0 0 0 0-2.88z" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231 5.45-6.231zm-1.161 17.52h1.833L7.084 4.126H5.117l11.966 15.644z" />
    </svg>
  );
}

function FacebookIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
    </svg>
  );
}

interface ProfileHeaderProps {
  profile: UserProfile;
  postCount: number;
  isOwnProfile: boolean;
}

/** Profile header card — avatar, stats, persona, stage, and action buttons. */
export function ProfileHeader({
  profile,
  postCount,
  isOwnProfile,
}: ProfileHeaderProps) {
  const [following, setFollowing] = useState(false);

  return (
    <div className="rounded-card border border-border-card bg-surface p-5">
      <div className="flex items-start gap-4">
        <Avatar
          username={profile.username}
          profilePictureUrl={profile.profilePictureUrl}
          size={80}
        />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-ink-secondary">
            {profile.username}
          </h2>
          <div className="mt-2">
            <StatsRow
              posts={postCount}
              followers={profile.followerCount}
              following={profile.followingCount}
            />
          </div>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <PersonaBadge persona={profile.onboarding.persona} />
        <span className="flex items-center gap-1 text-xs text-ink-muted">
          <MapPin className="h-3.5 w-3.5" aria-hidden />
          {profile.onboarding.city}, {profile.onboarding.province}
        </span>
      </div>

      <div className="mt-3">
        <StageIndicator stage={profile.onboarding.stage} />
      </div>

      <div className="mt-3 flex gap-3 text-ink-placeholder">
        <InstagramIcon className="h-4 w-4" />
        <XIcon className="h-4 w-4" />
        <FacebookIcon className="h-4 w-4" />
      </div>

      <div className="mt-4 flex gap-2">
        {isOwnProfile ? (
          <>
            <Button variant="secondary" size="sm">
              Edit profile
            </Button>
            <Button variant="secondary" size="sm">
              Share profile
            </Button>
          </>
        ) : (
          <Button
            variant={following ? "secondary" : "primary"}
            size="sm"
            onClick={() => setFollowing((value) => !value)}
          >
            {following ? "Following" : "Follow"}
          </Button>
        )}
      </div>
    </div>
  );
}
