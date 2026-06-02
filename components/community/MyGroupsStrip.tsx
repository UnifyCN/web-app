import Link from "next/link";
import { GroupCover } from "@/components/community/GroupCover";
import type { Group } from "@/types";

/** Horizontal scroll strip of the groups the user has joined. */
export function MyGroupsStrip({ groups }: { groups: Group[] }) {
  if (groups.length === 0) return null;

  return (
    <div>
      <h2 className="mb-2 text-sm font-semibold text-ink-secondary">
        My Groups
      </h2>
      <div className="scrollbar-thin flex gap-3 overflow-x-auto pb-2">
        {groups.map((group) => (
          <Link
            key={group.id}
            href={`/community/${group.id}`}
            className="flex w-32 shrink-0 flex-col items-center gap-2 rounded-card border border-border-card bg-surface p-3 transition-colors hover:bg-surface-gray"
          >
            <div className="relative h-14 w-14 overflow-hidden rounded-full">
              <GroupCover
                coverPhotoUrl={group.coverPhotoUrl}
                sizes="56px"
                iconClassName="h-6 w-6 text-ink-placeholder"
              />
            </div>
            <span className="line-clamp-2 text-center text-xs font-medium text-ink-secondary">
              {group.groupName}
            </span>
          </Link>
        ))}
      </div>
    </div>
  );
}
