"use client";

import { useState } from "react";
import {
  storageImageSrcSet,
  storageImageUrlAt,
  type ImageWidth,
} from "@/lib/supabase/imageUrl";
import {
  IMAGE_FADE_CLASS,
  hideWhileLoading,
  revealOnLoad,
} from "@/components/ui/imageFade";
import { cn } from "@/lib/utils";

const DEFAULT_WIDTHS: readonly ImageWidth[] = [320, 640, 1080];

interface StorageImageProps {
  /** A stored object key (`users/<uid>/…`) or a full URL. */
  src?: string | null;
  alt: string;
  /** Sizing / object-fit classes — applied to both the image and the
   *  empty/failed placeholder so the box stays stable. */
  className?: string;
  /** How wide the image is shown, as an `<img sizes>` value. */
  sizes?: string;
  /** Widths offered to the browser; it picks one from `sizes` and the screen. */
  widths?: readonly ImageWidth[];
  /** For an image that is on screen as soon as the page opens: load it right
   *  away and ahead of other images, instead of lazily. */
  priority?: boolean;
}

/**
 * Renders an image stored as a signed-URL key, at display size, from a stable
 * cacheable URL (see lib/supabase/imageUrl.ts). Loads lazily (unless `priority`)
 * and fades in when it had to be fetched; a cached image just shows. Give the parent a fixed box
 * (and a neutral background if it should read as a placeholder while loading).
 * Uses a plain `<img>` on purpose: the route already resizes, so `next/image`
 * would only resize a second time.
 */
export function StorageImage({
  src,
  alt,
  className,
  sizes = "(max-width: 768px) 100vw, 640px",
  widths = DEFAULT_WIDTHS,
  priority = false,
}: StorageImageProps) {
  // The middle width is the fallback for browsers that ignore `srcset`.
  const url = storageImageUrlAt(src, widths[Math.floor(widths.length / 2)]);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  if (!url || failedUrl === url) {
    return <div aria-hidden className={cn("bg-surface-gray", className)} />;
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- already resized by /api/storage/image; next/image would resize it a second time
    <img
      key={url}
      ref={hideWhileLoading}
      src={url}
      srcSet={storageImageSrcSet(src, widths)}
      sizes={sizes}
      alt={alt}
      loading={priority ? "eager" : "lazy"}
      fetchPriority={priority ? "high" : "auto"}
      decoding="async"
      onLoad={revealOnLoad}
      onError={() => setFailedUrl(url)}
      className={cn(IMAGE_FADE_CLASS, className)}
    />
  );
}
