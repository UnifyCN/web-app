import Image from "next/image";
import { cn } from "@/lib/utils";

/** Aspect ratio of the lockup asset (6039 × 2699). */
const LOCKUP_RATIO = 6039 / 2699;

interface UnifyLogoProps {
  /** "mark" = symbol only; "lockup" = symbol + "unify" wordmark. */
  variant?: "mark" | "lockup";
  /** Pixel height of the logo. Default 28. */
  size?: number;
  /** Prioritise loading (use for above-the-fold placements). */
  priority?: boolean;
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
  className,
}: UnifyLogoProps) {
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
