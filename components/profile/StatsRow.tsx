interface StatsRowProps {
  posts: number;
  followers: number;
  following: number;
}

/** Posts / Followers / Following counts for the profile header. */
export function StatsRow({ posts, followers, following }: StatsRowProps) {
  const stats = [
    { label: "Posts", value: posts },
    { label: "Followers", value: followers },
    { label: "Following", value: following },
  ];

  return (
    <div className="flex gap-6">
      {stats.map((stat) => (
        <div key={stat.label} className="text-center">
          <p className="text-base font-bold text-ink-secondary">
            {stat.value.toLocaleString("en-CA")}
          </p>
          <p className="text-xs text-ink-placeholder">{stat.label}</p>
        </div>
      ))}
    </div>
  );
}
