/**
 * Loading placeholder for PostCard. Mirrors PostCard's layout/spacing so the
 * feed doesn't shift when real posts replace it. Used by the home feed and the
 * profile Posts/Saved tabs.
 */
export function PostCardSkeleton({ withImage = false }: { withImage?: boolean }) {
  return (
    <div className="animate-pulse px-5 py-4" aria-hidden>
      {/* Header: avatar + name/timestamp */}
      <div className="flex items-center gap-3">
        <div className="h-10 w-10 shrink-0 rounded-full bg-surface-gray" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3.5 w-32 rounded bg-surface-gray" />
          <div className="h-3 w-24 rounded bg-surface-gray" />
        </div>
      </div>

      {/* Body: title + content lines */}
      <div className="mt-3 space-y-2">
        <div className="h-4 w-3/4 rounded bg-surface-gray" />
        <div className="h-3 w-full rounded bg-surface-gray" />
        <div className="h-3 w-5/6 rounded bg-surface-gray" />
      </div>

      {/* Optional image */}
      {withImage && (
        <div className="mt-3 aspect-[4/3] w-full rounded-lg bg-surface-gray" />
      )}

      {/* Actions: like / comment / save */}
      <div className="mt-4 flex items-center gap-6">
        <div className="h-4 w-10 rounded bg-surface-gray" />
        <div className="h-4 w-10 rounded bg-surface-gray" />
        <div className="h-4 w-10 rounded bg-surface-gray" />
      </div>
    </div>
  );
}
