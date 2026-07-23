import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { cn, RTL_FLIP } from "@/lib/utils";
import { Blob } from "./Blob";

interface SubmoduleContinueCardProps {
  moduleId: string;
  submoduleId: string;
  submoduleTitle: string;
  lessonCount: number;
  completePercent: number;
  targetLessonId: string;
  colorHex: string;
  label: "Continue" | "Review";
}

export function SubmoduleContinueCard({
  moduleId,
  submoduleId,
  submoduleTitle,
  lessonCount,
  completePercent,
  targetLessonId,
  colorHex,
  label,
}: SubmoduleContinueCardProps) {
  return (
    <div
      className="relative overflow-hidden rounded-card p-5 text-white shadow-sm"
      style={{ backgroundColor: colorHex }}
    >
      <Blob
        variant="blob-3"
        color="#ffffff"
        opacity={0.3}
        className="absolute -right-12 -top-16 z-0 h-56 aspect-[225/242]"
      />
      <div className="relative flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h3 className="text-lg font-bold leading-tight">{submoduleTitle}</h3>
          <p className="text-sm text-white/85">
            {lessonCount} {lessonCount === 1 ? "lesson" : "lessons"} ·{" "}
            {completePercent}% complete
          </p>
        </div>
        <Link
          href={`/learn/${moduleId}/${submoduleId}/${targetLessonId}`}
          className="inline-flex h-10 w-fit cursor-pointer items-center gap-1.5 rounded-md bg-white px-4 text-sm font-semibold transition-colors hover:bg-surface-gray"
          style={{ color: colorHex }}
        >
          {label}
          <ArrowRight className={cn("h-4 w-4", RTL_FLIP)} aria-hidden />
        </Link>
      </div>
    </div>
  );
}
