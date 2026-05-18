"use client";

import { useState } from "react";
import { OverallProgressBar } from "@/components/checklist/OverallProgressBar";
import { PrioritySection } from "@/components/checklist/PrioritySection";
import { AddCustomTask } from "@/components/checklist/AddCustomTask";
import { tasks as seedTasks } from "@/lib/mock/tasks";
import type { ChecklistTask, Priority } from "@/types";

const PRIORITY_ORDER: Priority[] = [
  "Do now",
  "Do soon",
  "Explore and connect",
  "Optional / later",
];

export default function ChecklistPage() {
  const [tasks, setTasks] = useState<ChecklistTask[]>(seedTasks);

  const completedCount = tasks.filter((task) => task.completed).length;

  function toggleTask(id: string) {
    setTasks((prev) =>
      prev.map((task) =>
        task.id === id
          ? {
              ...task,
              completed: !task.completed,
              completedAt: task.completed ? null : new Date().toISOString(),
            }
          : task,
      ),
    );
  }

  function addTask({
    title,
    description,
    priority,
  }: {
    title: string;
    description: string;
    priority: Priority;
  }) {
    setTasks((prev) => [
      ...prev,
      {
        id: `custom-${Date.now()}`,
        priority,
        title,
        description,
        completed: false,
        completedAt: null,
        isCustom: true,
      },
    ]);
  }

  return (
    <div className="mx-auto max-w-[720px] px-6 py-6">
      <h1 className="text-xl font-semibold text-ink-secondary">Checklist</h1>
      <p className="mt-1 text-sm text-ink-muted">
        Your step-by-step guide to settling into Canada.
      </p>

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
            onToggle={toggleTask}
          />
        ))}

        <AddCustomTask onAdd={addTask} />
      </div>
    </div>
  );
}
