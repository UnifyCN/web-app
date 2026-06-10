/** Skeleton list of comment cards (matches CommentCard shape). */
export function SkeletonCommentList({ count = 3 }: { count?: number }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: count }).map((_, i) => (
        <div
          key={i}
          className="animate-pulse rounded-card border border-border-card bg-surface px-5 py-4 shadow-sm"
          aria-hidden
        >
          <div className="space-y-2">
            <div className="h-3 w-full rounded bg-surface-gray" />
            <div className="h-3 w-4/5 rounded bg-surface-gray" />
          </div>
          <div className="mt-3 h-2.5 w-1/2 rounded bg-surface-gray" />
        </div>
      ))}
    </div>
  );
}
