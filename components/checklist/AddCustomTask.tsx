"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import type { Priority } from "@/types";

const PRIORITIES: Priority[] = [
  "Do now",
  "Do soon",
  "Explore and connect",
  "Optional / later",
];

const FIELD_CLASS =
  "w-full rounded-lg border border-border-card bg-surface px-3 py-2 text-base " +
  "text-ink-muted placeholder:text-ink-placeholder focus-visible:outline-none " +
  "focus-visible:ring-2 focus-visible:ring-primary";

interface AddCustomTaskProps {
  onAdd: (task: {
    title: string;
    description: string;
    priority: Priority;
  }) => void;
}

/** "Add your own item" — collapses to a button, expands to a small form. */
export function AddCustomTask({ onAdd }: AddCustomTaskProps) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState<Priority>("Do soon");

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;
    // Persisted by useAddCustomTask → custom_checklist_tasks (Supabase).
    onAdd({ title: title.trim(), description: description.trim(), priority });
    setTitle("");
    setDescription("");
    setPriority("Do soon");
    setOpen(false);
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-card border border-dashed border-border-card bg-surface py-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink"
      >
        <Plus className="h-4 w-4" aria-hidden />
        Add your own item
      </button>
    );
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-3 rounded-card border border-border-card bg-surface p-4"
    >
      <input
        type="text"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        placeholder="Task name"
        aria-label="Task name"
        autoFocus
        className={FIELD_CLASS}
      />
      <input
        type="text"
        value={description}
        onChange={(event) => setDescription(event.target.value)}
        placeholder="Short description (optional)"
        aria-label="Task description"
        className={FIELD_CLASS}
      />
      <select
        value={priority}
        onChange={(event) => setPriority(event.target.value as Priority)}
        aria-label="Priority"
        className={FIELD_CLASS}
      >
        {PRIORITIES.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
      <div className="flex gap-2">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={!title.trim()}
        >
          Add task
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setOpen(false)}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
