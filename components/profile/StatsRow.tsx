import Link from "next/link";

interface StatsRowProps {
  posts: number;
  followers: number;
  following: number;
  /** When set, Followers / Following link to that user's follow-list page. */
  userId?: string;
}

/** A single stat — a link when `href` is provided, otherwise plain text. */
function Stat({
  label,
  value,
  href,
}: {
  label: string;
  value: number;
  href?: string;
}) {
  const content = (
    <>
      <p className="text-base font-bold text-ink-secondary">
        {value.toLocaleString("en-CA")}
      </p>
      <p className="text-xs text-ink-placeholder">{label}</p>
    </>
  );

  if (!href) return <div className="text-center">{content}</div>;

  return (
    <Link
      href={href}
      className="rounded text-center transition-opacity hover:opacity-70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
    >
      {content}
    </Link>
  );
}

/** Posts / Followers / Following counts for the profile header. */
export function StatsRow({ posts, followers, following, userId }: StatsRowProps) {
  const followersHref = userId
    ? `/profile/${userId}/followers?tab=followers`
    : undefined;
  const followingHref = userId
    ? `/profile/${userId}/followers?tab=following`
    : undefined;

  return (
    <div className="flex gap-6">
      <Stat label="Posts" value={posts} />
      <Stat label="Followers" value={followers} href={followersHref} />
      <Stat label="Following" value={following} href={followingHref} />
    </div>
  );
}
