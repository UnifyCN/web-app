import Link from "next/link";
import { ProgressRing } from "./ProgressRing";
import type { LessonProgress, SanityLesson } from "@/types";

interface LessonRowProps {
  moduleId: string;
  lesson: SanityLesson;
  progress?: LessonProgress;
}

/** A lesson row on the module detail page — progress ring + title + copy. */
export function LessonRow({ moduleId, lesson, progress }: LessonRowProps) {
  const percent = progress?.isCompleted
    ? 100
    : (progress?.progressPercent ?? 0);

  return (
    <Link
      href={`/learn/${moduleId}/${lesson._id}`}
      className="group flex items-start gap-4 rounded-card border border-border-card bg-surface p-4 transition-colors hover:bg-surface-card"
    >
      <ProgressRing percent={percent} size={64} />
      <div className="flex flex-1 flex-col">
        <h3 className="text-base font-bold text-ink-secondary transition-colors group-hover:text-primary">
          {lesson.title}
        </h3>
        {lesson.description && (
          <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
            {lesson.description}
          </p>
        )}
      </div>
    </Link>
  );
}
