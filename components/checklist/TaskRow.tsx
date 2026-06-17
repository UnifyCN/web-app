"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { Check, GripVertical, Trash2 } from "lucide-react";
import type {
  DraggableAttributes,
  DraggableSyntheticListeners,
} from "@dnd-kit/core";
import { cn } from "@/lib/utils";
import { fireTaskConfetti } from "@/lib/confetti";
import type { ChecklistTask } from "@/types";

interface TaskRowProps {
  task: ChecklistTask;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
  /** @dnd-kit sortable handle wiring — when present, renders the right-side
   *  drag handle that initiates a reorder (and supports keyboard reordering). */
  dragHandleRef?: (element: HTMLElement | null) => void;
  dragHandleAttributes?: DraggableAttributes;
  dragHandleListeners?: DraggableSyntheticListeners;
}

/** A single checklist task — checkbox, title, description, "Learn how" link. */
export function TaskRow({
  task,
  onToggle,
  onDelete,
  dragHandleRef,
  dragHandleAttributes,
  dragHandleListeners,
}: TaskRowProps) {
  const [pop, setPop] = useState(false);
  const checkboxRef = useRef<HTMLButtonElement>(null);

  function handleToggle() {
    if (!task.completed) {
      setPop(true);
      window.setTimeout(() => setPop(false), 220);
      const rect = checkboxRef.current?.getBoundingClientRect();
      if (rect) {
        fireTaskConfetti({
          x: (rect.left + rect.width / 2) / window.innerWidth,
          y: (rect.top + rect.height / 2) / window.innerHeight,
        });
      }
    }
    onToggle(task.id);
  }

  return (
    <div className="flex gap-3 px-4 py-3">
      <button
        ref={checkboxRef}
        type="button"
        role="checkbox"
        aria-checked={task.completed}
        aria-label={task.completed ? "Mark as not done" : "Mark as done"}
        onClick={handleToggle}
        className={cn(
          "mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md border-2 transition-colors",
          task.completed
            ? "border-primary bg-primary text-white"
            : "border-border-card hover:border-primary",
          pop && "animate-checkbox-pop",
        )}
      >
        {task.completed && <Check className="h-3.5 w-3.5" aria-hidden />}
      </button>

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "task-strike text-sm font-medium transition-colors duration-200",
            task.completed
              ? "task-strike-done text-ink-placeholder"
              : "text-ink-secondary",
          )}
        >
          {task.title}
        </p>
        {task.description && (
          <p
            className={cn(
              "mt-0.5 text-xs leading-relaxed transition-colors duration-200",
              task.completed ? "text-ink-inactive" : "text-ink-muted",
            )}
          >
            {task.description}
          </p>
        )}
        {task.learnHowHref && !task.completed && (
          <Link
            href={task.learnHowHref}
            className="mt-1 inline-block text-xs font-semibold text-primary transition-colors hover:text-primary-dark"
          >
            Learn how
          </Link>
        )}
      </div>

      {task.isCustom && (
        <button
          type="button"
          onClick={() => onDelete(task.id)}
          aria-label={`Delete task: ${task.title}`}
          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded-md text-ink-placeholder transition-colors hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" aria-hidden />
        </button>
      )}

      {dragHandleListeners && (
        <button
          type="button"
          ref={dragHandleRef}
          aria-label={`Reorder task: ${task.title}`}
          className="mt-0.5 flex h-5 w-5 shrink-0 cursor-grab touch-none items-center justify-center text-ink-placeholder transition-colors hover:text-ink-muted active:cursor-grabbing"
          {...dragHandleAttributes}
          {...dragHandleListeners}
        >
          <GripVertical className="h-4 w-4" aria-hidden />
        </button>
      )}
    </div>
  );
}
