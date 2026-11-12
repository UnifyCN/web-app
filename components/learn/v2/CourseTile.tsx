import {
  courseTopic,
  TOPIC_ICONS,
  topicClasses,
} from "@/lib/learn/v2/courseTopics";
import { cn } from "@/lib/utils";

/**
 * A course's icon tile (replaces the old colour waves). `sm` is the list row
 * size (45px tile, 24px icon), `md` the resume card and course header (56px,
 * 32px icon), as in the Figma.
 */
export function CourseTile({
  course,
  size = "sm",
  className,
}: {
  course: { _id: string; icon?: string | null };
  size?: "sm" | "md";
  className?: string;
}) {
  const topic = courseTopic(course);
  const Icon = TOPIC_ICONS[topic];
  const { tile, icon } = topicClasses(topic);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-xl",
        size === "sm" ? "size-11" : "size-14",
        tile,
        className,
      )}
    >
      <Icon
        className={cn(size === "sm" ? "size-6" : "size-8", icon)}
        strokeWidth={1.75}
      />
    </span>
  );
}
