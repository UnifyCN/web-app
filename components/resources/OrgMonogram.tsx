import { cn, getInitials } from "@/lib/utils";

interface OrgMonogramProps {
  /** Organization name — initials fallback + alt text. */
  name: string;
  /** Category accent color (hex), used for the tinted background + initials. */
  color: string;
  /** Optional logo URL; when absent, a tinted initials monogram renders. */
  logo?: string;
  /** Pixel size (square). Default 44. */
  size?: number;
  className?: string;
}

/**
 * Square org avatar for the Resources directory. Renders the logo when present,
 * otherwise a category-tinted initials monogram — the mobile app ships no logo
 * assets, so in practice every org uses the monogram fallback. Distinct from the
 * user `Avatar` (which resolves signed S3 URLs); orgs have plain public URLs.
 */
export function OrgMonogram({
  name,
  color,
  logo,
  size = 44,
  className,
}: OrgMonogramProps) {
  const dimensions = { width: size, height: size };

  if (logo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- partner logo URLs are arbitrary public hosts (not in the next.config allowlist)
      <img
        src={logo}
        alt={name}
        style={dimensions}
        className={cn("shrink-0 rounded-xl object-cover", className)}
      />
    );
  }

  return (
    <div
      role="img"
      aria-label={name}
      // 8-digit hex: `${color}1A` ≈ 10% opacity tint behind the full-strength
      // accent-colored initials.
      style={{ ...dimensions, backgroundColor: `${color}1A`, color }}
      className={cn(
        "flex shrink-0 select-none items-center justify-center rounded-xl font-semibold",
        className,
      )}
    >
      <span style={{ fontSize: Math.round(size * 0.38) }}>
        {getInitials(name)}
      </span>
    </div>
  );
}
