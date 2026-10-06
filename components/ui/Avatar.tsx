"use client";

import { useState } from "react";
import { cn, getInitials } from "@/lib/utils";
import { storageImageUrl } from "@/lib/supabase/imageUrl";
import {
  IMAGE_FADE_CLASS,
  hideWhileLoading,
  revealOnLoad,
} from "@/components/ui/imageFade";

interface AvatarProps {
  profilePictureUrl?: string | null;
  username: string;
  /** Pixel diameter. Default 36. */
  size?: number;
  className?: string;
}

/**
 * Circular user avatar. `profilePictureUrl` is a stored object key
 * (`users/<uid>/…`) or a full URL. The picture is requested at display size
 * from a stable, cacheable URL (see lib/supabase/imageUrl.ts), so it needs no
 * lookup before it can render and comes straight from the browser cache on a
 * revisit. Initials sit underneath: they show while the picture loads, if it
 * fails, or when there is none, and the box never changes size.
 */
export function Avatar({
  profilePictureUrl,
  username,
  size = 36,
  className,
}: AvatarProps) {
  const src = storageImageUrl(profilePictureUrl, size);
  // Remember which URL failed, so a new picture gets a fresh attempt.
  const [failedSrc, setFailedSrc] = useState<string | null>(null);

  return (
    <span
      role="img"
      aria-label={username}
      style={{ width: size, height: size }}
      className={cn(
        "relative flex shrink-0 select-none items-center justify-center overflow-hidden rounded-full",
        "bg-primary-subtle font-semibold text-primary-dark",
        className,
      )}
    >
      <span aria-hidden style={{ fontSize: Math.round(size * 0.4) }}>
        {getInitials(username)}
      </span>
      {src && failedSrc !== src && (
        // eslint-disable-next-line @next/next/no-img-element -- already resized by /api/storage/image; next/image would resize it a second time
        <img
          key={src}
          ref={hideWhileLoading}
          src={src}
          alt=""
          width={size}
          height={size}
          // Not lazy, and decoded in place: an avatar is a few kilobytes, and
          // this way one the browser already has paints in the same frame as
          // the row it belongs to, with no initials showing first.
          decoding="sync"
          onLoad={revealOnLoad}
          onError={() => setFailedSrc(src)}
          className={cn(
            "absolute inset-0 h-full w-full object-cover",
            IMAGE_FADE_CLASS,
          )}
        />
      )}
    </span>
  );
}
