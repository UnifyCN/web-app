import { Avatar } from "@/components/ui/Avatar";
import { cn } from "@/lib/utils";
import type { GroupMemberAvatar } from "@/types";

const MAX_VISIBLE = 4;

interface GroupMemberAvatarStackProps {
  avatars: GroupMemberAvatar[];
  totalCount: number;
  className?: string;
}

/** Overlapping member avatars (resolved signed URL or initials) + a "+N
 *  members" label. */
export function GroupMemberAvatarStack({
  avatars,
  totalCount,
  className,
}: GroupMemberAvatarStackProps) {
  const visible = avatars.slice(0, MAX_VISIBLE);

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex">
        {visible.map((member, index) => (
          <div
            key={`${member.username}-${index}`}
            style={{ zIndex: MAX_VISIBLE - index }}
            className={cn(
              "rounded-full ring-2 ring-surface",
              index > 0 && "-ml-2.5",
            )}
          >
            <Avatar
              profilePictureUrl={member.profilePictureUrl}
              username={member.username}
              size={32}
            />
          </div>
        ))}
      </div>
      <span className="ml-2.5 text-sm text-ink-muted">
        +{totalCount.toLocaleString("en-CA")} members
      </span>
    </div>
  );
}
