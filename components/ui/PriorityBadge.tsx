"use client";

import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { PRIORITY_LABEL_KEY } from "@/lib/i18n/labels";
import type { Priority } from "@/types";

interface PriorityBadgeProps {
  priority: Priority;
  className?: string;
}

const PRIORITY_STYLES: Record<Priority, { dot: string; pill: string }> = {
  "Do now": {
    dot: "bg-priority-do-now",
    pill: "bg-priority-do-now-bg text-priority-do-now",
  },
  "Do soon": {
    dot: "bg-priority-do-soon",
    pill: "bg-priority-do-soon-bg text-priority-do-soon",
  },
  "Explore and connect": {
    dot: "bg-priority-explore",
    pill: "bg-priority-explore-bg text-priority-explore",
  },
  "Optional / later": {
    dot: "bg-priority-optional",
    pill: "bg-priority-optional-bg text-priority-optional",
  },
};

/** Checklist priority pill — colored dot + label on a matching tint. */
export function PriorityBadge({ priority, className }: PriorityBadgeProps) {
  const { t } = useTranslation();
  const style = PRIORITY_STYLES[priority];

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full",
        "px-2 py-0.5 text-xs font-semibold",
        style.pill,
        className,
      )}
    >
      <span
        className={cn("h-1.5 w-1.5 rounded-full", style.dot)}
        aria-hidden
      />
      {t(PRIORITY_LABEL_KEY[priority])}
    </span>
  );
}
