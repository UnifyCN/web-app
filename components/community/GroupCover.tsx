import Image from "next/image";
import { Users } from "lucide-react";

/**
 * Group cover image with a fallback for groups that have no coverPhotoUrl —
 * a grey panel with a generic community icon, so the card/strip/header don't
 * render a blank box. Fills its positioned (relative) parent, which owns the
 * aspect ratio, rounding, and overflow clipping.
 */
export function GroupCover({
  coverPhotoUrl,
  sizes,
  iconClassName = "h-8 w-8 text-ink-placeholder",
}: {
  coverPhotoUrl: string | null;
  /** next/image `sizes` for the parent's rendered width. */
  sizes: string;
  /** Tailwind classes for the fallback icon (size + colour). */
  iconClassName?: string;
}) {
  if (coverPhotoUrl) {
    return (
      <Image
        src={coverPhotoUrl}
        alt=""
        fill
        className="object-cover"
        sizes={sizes}
      />
    );
  }

  return (
    <div className="flex h-full w-full items-center justify-center bg-surface-gray">
      <Users className={iconClassName} aria-hidden />
    </div>
  );
}
