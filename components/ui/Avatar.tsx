import { cn } from "@/lib/utils";

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
 * Circular user avatar. Falls back to initials on a warm tint when no
 * profile picture is available.
 */
export function Avatar({
  profilePictureUrl,
  username,
  size = 36,
  className,
}: AvatarProps) {
  const dimensions = { width: size, height: size };

  // The shared (mobile) DB stores avatars as bucket paths ("users/<uid>/…"),
  // not URLs; only render an actual http(s) URL, else fall back to initials.
  if (profilePictureUrl && /^https?:\/\//i.test(profilePictureUrl)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- mock avatars; next/image not configured in the frontend-only build
      <img
        src={profilePictureUrl}
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
