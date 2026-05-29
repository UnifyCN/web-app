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
    <div className="mx-auto max-w-[720px] px-6 py-6">
      <h1 className="text-xl font-semibold text-ink-secondary">Checklist</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Your step-by-step guide to settling into Canada.
      </p>

      {isLoading && (
        <p className="mt-5 text-sm text-ink-muted">Loading your checklist…</p>
      )}

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
