import { Compass, Landmark, HeartPulse, Plane, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Starter {
  topic: string;
  question: string;
  icon: React.ComponentType<{ className?: string }>;
  tile: string;
  accent: string;
}

const STARTERS: Starter[] = [
  {
    topic: "Settlement",
    question: "What resources are available for newcomers settling in Canada?",
    icon: Compass,
    tile: "bg-priority-optional-bg",
    accent: "text-priority-optional",
  },
  {
    topic: "Finance",
    question: "How do I open a bank account and build credit in Canada?",
    icon: Landmark,
    tile: "bg-priority-do-soon-bg",
    accent: "text-priority-do-soon",
  },
  {
    topic: "Healthcare",
    question: "How do I apply for a provincial health card?",
    icon: HeartPulse,
    tile: "bg-priority-do-now-bg",
    accent: "text-priority-do-now",
  },
  {
    topic: "Immigration",
    question: "How does Express Entry work for permanent residence?",
    icon: Plane,
    tile: "bg-priority-explore-bg",
    accent: "text-priority-explore",
  },
];

/** Four tappable starter prompts for the Companion empty state. */
export function StarterPromptChips({
  onSelect,
}: {
  onSelect: (question: string) => void;
}) {
  return (
    <div className="grid w-full grid-cols-1 gap-3 sm:grid-cols-2">
      {STARTERS.map((starter) => {
        const Icon = starter.icon;
        return (
          <button
            key={starter.topic}
            type="button"
            onClick={() => onSelect(starter.question)}
            className="flex cursor-pointer items-start gap-3 rounded-card border border-border-card bg-surface p-3 text-left transition-shadow duration-150 hover:shadow-md"
          >
            <span
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                starter.tile,
              )}
            >
              <Icon className={cn("h-5 w-5", starter.accent)} />
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between">
                <span className="text-sm font-semibold text-ink-secondary">
                  {starter.topic}
                </span>
                <ChevronRight
                  className="h-4 w-4 text-ink-placeholder"
                  aria-hidden
                />
              </span>
              <span className="mt-0.5 block text-xs leading-relaxed text-ink-muted">
                {starter.question}
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
