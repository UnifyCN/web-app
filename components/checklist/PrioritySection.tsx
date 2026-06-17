"use client";

import { useEffect, useRef, useState } from "react";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  AlertCircle,
  Clock,
  Compass,
  CircleDashed,
  ChevronDown,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useReorderTasks } from "@/hooks/useChecklist";
import { TaskRow } from "./TaskRow";
import type { ChecklistTask, Priority } from "@/types";

/** One sortable row — only the right-side handle (its dnd-kit attributes +
 *  listeners) starts the drag; the rest of the row stays interactive. */
function SortableTaskRow({
  task,
  onToggle,
  onDelete,
}: {
  task: ChecklistTask;
  onToggle: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: task.id });

  const style: React.CSSProperties = {
    // Translate-only (not Transform): dnd-kit's full transform includes
    // scaleX/scaleY under verticalListSortingStrategy, which distorts the card's
    // contents mid-drag. We only want positional movement.
    transform: CSS.Translate.toString(transform),
    transition,
    ...(isDragging
      ? {
          position: "relative",
          zIndex: 1,
          boxShadow: "0 8px 20px rgba(0,0,0,0.12)",
        }
      : {}),
  };

  return (
    <div ref={setNodeRef} style={style} className="bg-surface">
      <TaskRow
        task={task}
        onToggle={onToggle}
        onDelete={onDelete}
        dragHandleRef={setActivatorNodeRef}
        dragHandleAttributes={attributes}
        dragHandleListeners={listeners}
      />
    </div>
  );
}

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
  onDelete: (id: string) => void;
}

/** Collapsible checklist section for one priority bucket, with @dnd-kit
 *  drag-to-reorder (within the bucket only). */
export function PrioritySection({
  priority,
  tasks,
  onToggle,
  onDelete,
}: PrioritySectionProps) {
  const [open, setOpen] = useState(true);
  const reorder = useReorderTasks();

  // Local order is the rendered source of truth; it re-seeds from the `tasks`
  // prop when that genuinely changes (toggle / add / delete / refetch / a saved
  // order from mobile), but never mid-drag.
  const [items, setItems] = useState(tasks);
  const draggingRef = useRef(false);

  const signature =
    tasks.map((t) => t.id).join("|") +
    "#" +
    tasks.map((t) => (t.completed ? "1" : "0")).join("");
  useEffect(() => {
    if (draggingRef.current) return;
    setItems((prev) => {
      const unchanged =
        prev.length === tasks.length &&
        prev.every(
          (t, i) => t.id === tasks[i].id && t.completed === tasks[i].completed,
        );
      return unchanged ? prev : tasks;
    });
    // `signature` is the real trigger; `tasks` is a fresh array every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    draggingRef.current = false;
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = items.findIndex((t) => t.id === active.id);
    const newIndex = items.findIndex((t) => t.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const next = arrayMove(items, oldIndex, newIndex);
    setItems(next);
    reorder.mutate({ priority, bucket: next });
  }

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
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={() => {
            draggingRef.current = true;
          }}
          onDragEnd={handleDragEnd}
          onDragCancel={() => {
            draggingRef.current = false;
          }}
        >
          <SortableContext
            items={items.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="divide-y divide-border-card border-t border-border-card">
              {items.map((task) => (
                <SortableTaskRow
                  key={task.id}
                  task={task}
                  onToggle={onToggle}
                  onDelete={onDelete}
                />
              ))}
            </div>
          </SortableContext>
        </DndContext>
      )}
    </section>
  );
}
