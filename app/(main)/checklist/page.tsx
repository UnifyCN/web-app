"use client";

import { useState } from "react";
import { OverallProgressBar } from "@/components/checklist/OverallProgressBar";
import { PrioritySection } from "@/components/checklist/PrioritySection";
import { AddCustomTask } from "@/components/checklist/AddCustomTask";
import { DeleteTaskModal } from "@/components/checklist/DeleteTaskModal";
import {
  useAddCustomTask,
  useDeleteCustomTask,
  useTasks,
  useToggleTask,
} from "@/hooks/useChecklist";
import type { ChecklistTask, Priority } from "@/types";

const PRIORITY_ORDER: Priority[] = [
  "Do now",
  "Do soon",
  "Explore and connect",
  "Optional / later",
];

/** Loading placeholder mirroring the checklist content (progress bar + 4
 *  collapsible sections with task rows + add button). */
function ChecklistSkeleton() {
  const sectionRows = [3, 3, 2, 2];
  return (
    <div className="mt-5 animate-pulse space-y-4" aria-hidden>
      {/* Overall progress bar */}
      <div className="rounded-card border border-border-card bg-surface p-4">
        <div className="flex items-center justify-between">
          <div className="h-3.5 w-28 rounded bg-surface-gray" />
          <div className="h-3.5 w-24 rounded bg-surface-gray" />
        </div>
        <div className="mt-2 h-2 w-full rounded-full bg-surface-gray" />
      </div>

      {/* Priority sections */}
      {sectionRows.map((rows, s) => (
        <div
          key={s}
          className="overflow-hidden rounded-card border border-border-card bg-surface"
        >
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="h-8 w-8 shrink-0 rounded-lg bg-surface-gray" />
            <div className="h-4 w-28 rounded bg-surface-gray" />
            <div className="ml-auto h-5 w-10 rounded-full bg-surface-gray" />
            <div className="h-4 w-4 rounded bg-surface-gray" />
          </div>
          <div className="divide-y divide-border-card border-t border-border-card">
            {Array.from({ length: rows }).map((_, r) => (
              <div key={r} className="flex gap-3 px-4 py-3">
                <div className="mt-0.5 h-5 w-5 shrink-0 rounded-md bg-surface-gray" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3.5 w-3/4 rounded bg-surface-gray" />
                  <div className="h-3 w-full rounded bg-surface-gray" />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {/* Add custom task */}
      <div className="h-11 w-full rounded-card border border-dashed border-border-card" />
    </div>
  );
}

export default function ChecklistPage() {
  const { data: tasks = [], isLoading, error } = useTasks();
  const toggle = useToggleTask();
  const add = useAddCustomTask();
  const del = useDeleteCustomTask();
  const [deleteTarget, setDeleteTarget] = useState<ChecklistTask | null>(null);

  const completedCount = tasks.filter((task) => task.completed).length;

  function handleToggle(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (!task) return;
    toggle.mutate({
      id: task.id,
      isCustom: task.isCustom,
      completed: task.completed,
    });
  }

  function handleAdd(input: {
    title: string;
    description: string;
    priority: Priority;
  }) {
    add.mutate(input);
  }

  function requestDelete(id: string) {
    const task = tasks.find((t) => t.id === id);
    if (task) setDeleteTarget(task);
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    try {
      await del.mutateAsync(deleteTarget.id);
      setDeleteTarget(null);
    } catch {
      // Leave the modal open (isPending flips back to false) so the user can
      // retry or cancel.
    }
  }

  return (
    <div className="mx-auto max-w-[720px] animate-fade-in px-6 py-6">
      <h1 className="text-xl font-semibold text-ink-secondary">Checklist</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Your step-by-step guide to settling into Canada.
      </p>

      {isLoading && <ChecklistSkeleton />}

      {error && (
        <p role="alert" className="mt-5 text-sm text-destructive">
          Couldn&apos;t load your checklist.
        </p>
      )}

      {!isLoading && !error && (
        <div className="mt-5 space-y-4">
          <OverallProgressBar
            completed={completedCount}
            total={tasks.length}
          />

          {PRIORITY_ORDER.map((priority) => (
            <PrioritySection
              key={priority}
              priority={priority}
              tasks={tasks.filter((task) => task.priority === priority)}
              onToggle={handleToggle}
              onDelete={requestDelete}
            />
          ))}

          <AddCustomTask onAdd={handleAdd} />
        </div>
      )}

      <DeleteTaskModal
        open={deleteTarget !== null}
        taskTitle={deleteTarget?.title ?? ""}
        isPending={del.isPending}
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          if (!del.isPending) setDeleteTarget(null);
        }}
      />
    </div>
  );
}
