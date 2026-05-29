import Link from "next/link";
import { ArrowRight, Check } from "lucide-react";
import { cn } from "@/lib/utils";

export type SubmoduleState = "completed" | "in_progress" | "not_started";

interface SubmoduleTimelineRowProps {
  moduleId: string;
  submoduleId: string;
  title: string;
  lessonCount: number;
  completedCount: number;
  state: SubmoduleState;
  isActiveCTA: boolean;
  colorHex: string;
  isFirst: boolean;
  isLast: boolean;
}

export function SubmoduleTimelineRow({
  moduleId,
  submoduleId,
  title,
  lessonCount,
  completedCount,
  state,
  isActiveCTA,
  colorHex,
  isFirst,
  isLast,
}: SubmoduleTimelineRowProps) {
  const dotFilled = state === "completed";
  const dotRingColor =
    state === "completed" || state === "in_progress"
      ? colorHex
      : "var(--color-border-card)";
  const lineColor =
    state === "completed" || state === "in_progress"
      ? colorHex
      : "var(--color-border-card)";
  const lineDashed = state !== "completed";

  return (
    <li className="relative flex items-stretch gap-4">
      {/* Timeline rail */}
      <div className="relative flex w-6 flex-col items-center">
        <span
          aria-hidden
          className={cn(
            "w-0.5 grow",
            isFirst && "invisible",
            lineDashed ? "border-l-2 border-dashed" : "border-l-2 border-solid",
          )}
          style={{
            borderColor: lineColor,
            opacity: lineDashed ? 0.45 : 1,
          }}
        />
        <span
          className={cn(
            "my-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-2",
            dotFilled && "border-transparent",
          )}
          style={{
            borderColor: dotFilled ? "transparent" : dotRingColor,
            backgroundColor: dotFilled ? colorHex : "var(--color-surface)",
          }}
        >
          {dotFilled && (
            <Check
              className="h-2.5 w-2.5 text-white"
              strokeWidth={3}
              aria-hidden
            />
          )}
        </span>
        <span
          aria-hidden
          className={cn(
            "w-0.5 grow",
            isLast && "invisible",
            lineDashed ? "border-l-2 border-dashed" : "border-l-2 border-solid",
          )}
          style={{
            borderColor: lineColor,
            opacity: lineDashed ? 0.45 : 1,
          }}
        />
      </div>

      {/* Card */}
      <Link
        href={`/learn/${moduleId}/${submoduleId}`}
        className={cn(
          "my-1.5 flex flex-1 cursor-pointer items-center gap-3 rounded-card border p-4 transition-colors",
          isActiveCTA
            ? "border-transparent text-white shadow-sm"
            : "border-border-card bg-surface hover:bg-surface-card",
        )}
        style={
          isActiveCTA
            ? { backgroundColor: colorHex }
            : undefined
        }
      >
        <div className="flex-1 min-w-0">
          <h3
            className={cn(
              "text-base font-bold",
              isActiveCTA ? "text-white" : "text-ink-secondary",
            )}
          >
            {title}
          </h3>
          <p
            className={cn(
              "mt-0.5 text-xs",
              isActiveCTA ? "text-white/85" : "text-ink-muted",
            )}
          >
            {completedCount}/{lessonCount}{" "}
            {lessonCount === 1 ? "lesson" : "lessons"}
          </p>
        </div>
        {isActiveCTA && (
          <span
            className="inline-flex h-9 shrink-0 items-center gap-1 rounded-md bg-white px-3 text-xs font-semibold"
            style={{ color: colorHex }}
          >
            Continue
            <ArrowRight className="h-3.5 w-3.5" aria-hidden />
          </span>
        )}
      </Link>
    </li>
  );
}
