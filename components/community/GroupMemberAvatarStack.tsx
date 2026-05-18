import Image from "next/image";
import { cn } from "@/lib/utils";

const MAX_VISIBLE = 4;

interface GroupMemberAvatarStackProps {
  avatars: string[];
  totalCount: number;
  className?: string;
}

/** Overlapping member avatars + a "+N members" label. */
export function GroupMemberAvatarStack({
  avatars,
  totalCount,
  className,
}: GroupMemberAvatarStackProps) {
  const visible = avatars.slice(0, MAX_VISIBLE);

  return (
    <div className={cn("flex items-center", className)}>
      <div className="flex">
        {visible.map((url, index) => (
          <div
            key={url}
            style={{ zIndex: MAX_VISIBLE - index }}
            className={cn(
              "relative h-8 w-8 overflow-hidden rounded-full ring-2 ring-surface",
              index > 0 && "-ml-2.5",
            )}
          >
            <Image
              src={url}
              alt=""
              fill
              className="object-cover"
              sizes="32px"
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
