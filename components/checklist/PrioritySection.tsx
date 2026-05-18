"use client";

import { useState } from "react";
import {
  AlertCircle,
  Clock,
  Compass,
  CircleDashed,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { TaskRow } from "./TaskRow";
import type { ChecklistTask, Priority } from "@/types";

interface PriorityMeta {
  label: string;
  accent: string;
  tile: string;
  icon: React.ComponentType<{ className?: string }>;
}

const PRIORITY_META: Record<Priority, PriorityMeta> = {
  "Do now": {
    label: "Do now",
    accent: "text-priority-do-now",
    tile: "bg-priority-do-now-bg",
    icon: AlertCircle,
  },
  "Do soon": {
    label: "Do soon",
    accent: "text-priority-do-soon",
    tile: "bg-priority-do-soon-bg",
    icon: Clock,
  },
  "Explore and connect": {
    label: "Explore & connect",
    accent: "text-priority-explore",
    tile: "bg-priority-explore-bg",
    icon: Compass,
  },
  "Optional / later": {
    label: "Optional / later",
    accent: "text-priority-optional",
    tile: "bg-priority-optional-bg",
    icon: CircleDashed,
  },
};

interface PrioritySectionProps {
  priority: Priority;
  tasks: ChecklistTask[];
  onToggle: (id: string) => void;
}

/** Collapsible checklist section for one priority bucket. */
export function PrioritySection({
  priority,
  tasks,
  onToggle,
}: PrioritySectionProps) {
  const [open, setOpen] = useState(true);

  if (tasks.length === 0) return null;

  const meta = PRIORITY_META[priority];
  const Icon = meta.icon;
  const done = tasks.filter((task) => task.completed).length;

  return (
    <section className="overflow-hidden rounded-card border border-border-card bg-surface">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-3 px-4 py-3"
      >
        <span
          className={cn(
            "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
            meta.tile,
          )}
        >
          <Icon className={cn("h-4 w-4", meta.accent)} />
        </span>
        <span className="flex-1 text-left text-sm font-semibold text-ink-secondary">
          {meta.label}
        </span>
        <span className="rounded-full bg-surface-gray px-2 py-0.5 text-xs font-medium text-ink-muted">
          {done}/{tasks.length}
        </span>
        <ChevronDown
          className={cn(
            "h-4 w-4 text-ink-placeholder transition-transform duration-200",
            open && "rotate-180",
          )}
          aria-hidden
        />
      </button>

      {open && (
        <div className="divide-y divide-border-card border-t border-border-card">
          {tasks.map((task) => (
            <TaskRow key={task.id} task={task} onToggle={onToggle} />
          ))}
        </div>
      )}
    </section>
  );
}
