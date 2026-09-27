import Image from "next/image";
import { cn } from "@/lib/utils";

/** Aspect ratio of the lockup asset (6039 × 2699). */
const LOCKUP_RATIO = 6039 / 2699;

/** Visible (non-transparent) box of the lockup asset, as fractions of its
 *  6039 × 2699 canvas — alpha bbox (645, 769)–(5116, 2111). The asset carries
 *  wide transparent padding, so an untrimmed lockup looks much smaller than
 *  the space it takes. */
const LOCKUP_TRIM = {
  left: 645 / 6039,
  top: 769 / 2699,
  width: (5116 - 645) / 6039,
  height: (2111 - 769) / 2699,
};

interface UnifyLogoProps {
  /** "mark" = symbol only; "lockup" = symbol + "unify" wordmark. */
  variant?: "mark" | "lockup";
  /** Pixel height of the logo. Default 28. */
  size?: number;
  /** Prioritise loading (use for above-the-fold placements). */
  priority?: boolean;
  /** Lockup only: clip the asset's transparent padding so the rendered box is
   *  just the visible logo. `size` then sets the visible height. */
  trim?: boolean;
  className?: string;
}

/**
 * The Unify logo — the real brand mark (six figures in a ring).
 * Assets sourced from the Unify landing-page repo.
 */
export function UnifyLogo({
  variant = "mark",
  size = 28,
  priority = false,
  trim = false,
  className,
}: UnifyLogoProps) {
  if (variant === "lockup" && trim) {
    // Scale the full asset so its visible part is `size` tall, then offset it
    // inside a clipping box. Physical left/top: the logo never mirrors in RTL.
    const height = size / LOCKUP_TRIM.height;
    const width = height * LOCKUP_RATIO;
    return (
      <span
        className={cn("relative block overflow-hidden", className)}
        style={{
          width: Math.round(width * LOCKUP_TRIM.width),
          height: size,
        }}
      >
        <Image
          src="/logo/unify-lockup.png"
          alt="Unify"
          width={Math.round(width)}
          height={Math.round(height)}
          priority={priority}
          className="absolute max-w-none"
          style={{
            left: -width * LOCKUP_TRIM.left,
            top: -height * LOCKUP_TRIM.top,
          }}
        />
      </span>
    );
  }

  if (variant === "lockup") {
    return (
      <Image
        src="/logo/unify-lockup.png"
        alt="Unify"
        width={Math.round(size * LOCKUP_RATIO)}
        height={size}
        priority={priority}
        className={cn("object-contain", className)}
      />
    );
  }

  return (
    <Image
      src="/logo/unify-mark.png"
      alt="Unify"
      width={size}
      height={size}
      priority={priority}
      className={cn("object-contain", className)}
    />
  );
}
