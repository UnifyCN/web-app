import Image from "next/image";
import Link from "next/link";
import { ProgressRing } from "./ProgressRing";
import type { Lesson } from "@/types";

interface LessonRowProps {
  moduleId: string;
  lesson: Lesson;
}

/** A lesson row on the module detail page — image left, progress + copy right. */
export function LessonRow({ moduleId, lesson }: LessonRowProps) {
  const percent = lesson.isCompleted ? 100 : lesson.progressPercent;

  return (
    <Link
      href={`/learn/${moduleId}/${lesson.id}`}
      className="group flex gap-6"
    >
      <div className="relative aspect-[4/3] w-[55%] shrink-0 overflow-hidden rounded-card">
        <Image
          src={lesson.imageUrl}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 860px) 55vw, 470px"
        />
      </div>
      <div className="flex flex-1 flex-col">
        <ProgressRing percent={percent} size={64} />
        <h3 className="mt-3 text-base font-bold text-ink-secondary transition-colors group-hover:text-primary">
          {lesson.title}
        </h3>
        <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
          {lesson.description}
        </p>
      </div>
    </Link>
  );
}
