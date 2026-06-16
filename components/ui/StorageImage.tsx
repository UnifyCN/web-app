"use client";

import { useResolvedImageUrl } from "@/hooks/useResolvedImageUrl";
import { cn } from "@/lib/utils";

interface StorageImageProps {
  /** A stored object key (`users/<uid>/…`) or a full URL. */
  src?: string | null;
  alt: string;
  /** Sizing / object-fit classes — applied to both the image and the
   *  loading/empty placeholder so the box stays stable. */
  className?: string;
}

/**
 * Renders an image stored as a signed-URL key. Resolves the key at render time
 * (cached via `useResolvedImageUrl`) and shows a neutral placeholder while
 * loading or on failure. Uses a plain `<img>` on purpose: signed S3 URLs change
 * per request and expire, so `next/image` optimization/allow-listing doesn't fit.
 */
export function StorageImage({ src, alt, className }: StorageImageProps) {
  const { url, isLoading } = useResolvedImageUrl(src);

  if (!url) {
    return (
      <div
        aria-hidden
        className={cn("bg-surface-gray", isLoading && "animate-pulse", className)}
      />
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- signed S3 URLs expire per-request; next/image doesn't fit
    <img src={url} alt={alt} className={className} />
  );
}
