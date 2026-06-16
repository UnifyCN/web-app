"use client";

import { cn } from "@/lib/utils";
import { useResolvedImageUrl } from "@/hooks/useResolvedImageUrl";

interface AvatarProps {
  profilePictureUrl?: string | null;
  username: string;
  /** Pixel diameter. Default 36. */
  size?: number;
  className?: string;
}

/** First letter of up to the first two words, uppercased. */
function getInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

/**
 * Circular user avatar. `profilePictureUrl` is a stored object key
 * (`users/<uid>/…`) or a full URL; it's resolved to a signed URL at render time
 * (cached). Falls back to initials while loading, on error, or when there's no
 * picture.
 */
export function Avatar({
  profilePictureUrl,
  username,
  size = 36,
  className,
}: AvatarProps) {
  const dimensions = { width: size, height: size };
  const { url } = useResolvedImageUrl(profilePictureUrl);

  if (url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- signed S3 URLs expire per-request; next/image doesn't fit
      <img
        src={url}
        alt={username}
        style={dimensions}
        className={cn("shrink-0 rounded-full object-cover", className)}
      />
    );
  }

  return (
    <div
      style={dimensions}
      role="img"
      aria-label={username}
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-full",
        "bg-primary-subtle font-semibold text-primary-dark",
        className,
      )}
    >
      <span style={{ fontSize: Math.round(size * 0.4) }}>
        {getInitials(username)}
      </span>
    </div>
  );
}
