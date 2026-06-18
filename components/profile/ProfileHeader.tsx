"use client";

import { useRef, useState } from "react";
import { Calendar, Camera, Loader2, MapPin, Pencil } from "lucide-react";
import { Avatar } from "@/components/ui/Avatar";
import { Button } from "@/components/ui/Button";
import { StatsRow } from "./StatsRow";
import { FollowButton } from "./FollowButton";
import { PersonaBadge } from "./PersonaBadge";
import { StageIndicator } from "./StageIndicator";
import { OnboardingEditModal } from "@/components/onboarding/OnboardingEditModal";
import { UserModerationMenu } from "@/components/moderation/UserModerationMenu";
import {
  useRemoveAvatar,
  useUpdateAvatar,
  useUpdateUserDetails,
} from "@/hooks/useProfile";
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
  /** True when the viewed user follows the signed-in user back. */
  followsYou?: boolean;
}

/** Readable text for a failed mutation, falling back when there's no message. */
function errorText(error: unknown, fallback: string): string {
  return error instanceof Error && error.message ? error.message : fallback;
}

/** Profile header card — avatar, stats, persona, stage, and action buttons. */
export function ProfileHeader({
  profile,
  postCount,
  isOwnProfile,
  followsYou = false,
}: ProfileHeaderProps) {
  const [editing, setEditing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const updateAvatar = useUpdateAvatar();
  const removeAvatar = useRemoveAvatar();
  const avatarBusy = updateAvatar.isPending || removeAvatar.isPending;

  const [editingDetails, setEditingDetails] = useState(false);
  const [bioDraft, setBioDraft] = useState("");
  const [pronounsDraft, setPronounsDraft] = useState("");
  const updateDetails = useUpdateUserDetails();

  const openDetailsEditor = () => {
    updateDetails.reset(); // clear any prior error so it doesn't reappear
    setBioDraft(profile.bio ?? "");
    setPronounsDraft(profile.pronouns ?? "");
    setEditingDetails(true);
  };

  const avatarError = updateAvatar.isError
    ? errorText(updateAvatar.error, "Couldn't update your photo.")
    : removeAvatar.isError
      ? errorText(removeAvatar.error, "Couldn't remove your photo.")
      : null;

  const handleSaveDetails = () => {
    updateDetails.mutate(
      { bio: bioDraft, pronouns: pronounsDraft },
      { onSuccess: () => setEditingDetails(false) },
    );
  };

  const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    // Reset so re-picking the same file still fires onChange.
    event.target.value = "";
    if (file) updateAvatar.mutate(file);
  };

  // Prefer the onboarding first name as the display name, with @username beneath.
  const firstName = profile.onboarding?.firstName?.trim();

  const memberSince = profile.createdAt
    ? new Date(profile.createdAt).toLocaleDateString("en-CA", {
        month: "long",
        year: "numeric",
      })
    : null;

  const followsYouBadge =
    followsYou && !isOwnProfile ? (
      <span className="shrink-0 rounded-full bg-surface-gray px-2 py-0.5 text-[11px] font-medium text-ink-muted">
        Follows you
      </span>
    ) : null;

  return (
    <div className="rounded-card border border-border-card bg-surface p-5">
      <div className="flex items-start gap-4">
        <div className="relative shrink-0">
          <Avatar
            username={profile.username}
            profilePictureUrl={profile.profilePictureUrl}
            size={80}
          />
          {isOwnProfile && (
            <>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={avatarBusy}
                aria-label="Change profile photo"
                className="absolute -right-1 -bottom-1 flex h-7 w-7 cursor-pointer items-center justify-center rounded-full border-2 border-surface bg-primary text-white shadow-sm transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-60"
              >
                {avatarBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                ) : (
                  <Camera className="h-3.5 w-3.5" aria-hidden />
                )}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={handleAvatarFile}
              />
            </>
          )}
        </div>
        <div className="min-w-0 flex-1">
          {firstName ? (
            <>
              <h2 className="truncate text-lg font-bold text-ink-secondary">
                {firstName}
              </h2>
              <p className="text-sm text-ink-muted">
                @{profile.username}
                {profile.pronouns && (
                  <span className="ml-2 text-ink-placeholder">
                    {profile.pronouns}
                  </span>
                )}
              </p>
              {followsYouBadge && (
                <div className="mt-1.5">{followsYouBadge}</div>
              )}
            </>
          ) : (
            <>
              <h2 className="truncate text-lg font-bold text-ink-secondary">
                {profile.username}
                {profile.pronouns && (
                  <span className="ml-2 text-sm font-normal text-ink-placeholder">
                    {profile.pronouns}
                  </span>
                )}
              </h2>
              {followsYouBadge && (
                <div className="mt-1.5">{followsYouBadge}</div>
              )}
            </>
          )}
          <div className="mt-2">
            <StatsRow
              posts={postCount}
              followers={profile.followerCount}
              following={profile.followingCount}
              userId={profile.id}
            />
          </div>
        </div>
      </div>

      {memberSince && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-ink-placeholder">
          <Calendar className="h-3.5 w-3.5" aria-hidden />
          Member since {memberSince}
        </p>
      )}

      {avatarError && (
        <p className="mt-2 text-xs text-destructive" role="alert">
          {avatarError}
        </p>
      )}

      {profile.onboarding ? (
        <>
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
        </>
      ) : (
        isOwnProfile && (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="mt-3 cursor-pointer text-left text-xs font-medium text-primary hover:underline"
          >
            Complete your profile to add your persona, location, and stage.
          </button>
        )
      )}

      {editingDetails ? (
        <div className="mt-3 space-y-2">
          <textarea
            value={bioDraft}
            onChange={(event) => setBioDraft(event.target.value)}
            rows={3}
            maxLength={300}
            placeholder="Add a short bio"
            className="w-full resize-none rounded-lg border border-border-card bg-surface px-3 py-2 text-sm text-ink-muted outline-none focus:border-primary"
          />
          <input
            value={pronounsDraft}
            onChange={(event) => setPronounsDraft(event.target.value)}
            maxLength={30}
            placeholder="Pronouns (e.g. she/her)"
            className="w-full rounded-lg border border-border-card bg-surface px-3 py-2 text-sm text-ink-muted outline-none focus:border-primary"
          />
          <div className="flex gap-2">
            <Button
              variant="primary"
              size="sm"
              loading={updateDetails.isPending}
              onClick={handleSaveDetails}
            >
              Save
            </Button>
            <Button
              variant="ghost"
              size="sm"
              disabled={updateDetails.isPending}
              onClick={() => setEditingDetails(false)}
            >
              Cancel
            </Button>
          </div>
          {updateDetails.isError && (
            <p className="text-xs text-destructive" role="alert">
              {errorText(updateDetails.error, "Couldn't save your changes.")}
            </p>
          )}
        </div>
      ) : profile.bio ? (
        <div className="mt-3 flex items-start gap-2">
          <p className="flex-1 text-sm whitespace-pre-line text-ink-muted">
            {profile.bio}
          </p>
          {isOwnProfile && (
            <button
              type="button"
              onClick={openDetailsEditor}
              aria-label="Edit bio and pronouns"
              className="shrink-0 cursor-pointer p-1 text-ink-placeholder transition-colors hover:text-primary"
            >
              <Pencil className="h-3.5 w-3.5" aria-hidden />
            </button>
          )}
        </div>
      ) : (
        isOwnProfile && (
          <button
            type="button"
            onClick={openDetailsEditor}
            className="mt-3 cursor-pointer text-left text-xs font-medium text-primary hover:underline"
          >
            Add a bio and pronouns
          </button>
        )
      )}

      <div className="mt-3 flex gap-3 text-ink-placeholder">
        <InstagramIcon className="h-4 w-4" />
        <XIcon className="h-4 w-4" />
        <FacebookIcon className="h-4 w-4" />
      </div>

      <div className="mt-4 flex gap-2">
        {isOwnProfile ? (
          <>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              Edit profile
            </Button>
            <Button variant="secondary" size="sm">
              Share profile
            </Button>
            {profile.profilePictureUrl && (
              <Button
                variant="ghost"
                size="sm"
                loading={removeAvatar.isPending}
                onClick={() => removeAvatar.mutate()}
              >
                Remove photo
              </Button>
            )}
          </>
        ) : (
          <>
            <FollowButton userId={profile.id} />
            <UserModerationMenu
              userId={profile.id}
              username={profile.username}
            />
          </>
        )}
      </div>

      {isOwnProfile && (
        <OnboardingEditModal
          open={editing}
          onClose={() => setEditing(false)}
          profile={profile.onboarding}
        />
      )}
    </div>
  );
}
