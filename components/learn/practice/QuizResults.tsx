"use client";

import Link from "next/link";
import { Award } from "lucide-react";

interface QuizResultsProps {
  score: number;
  total: number;
  colorHex: string;
  sectionHref: string;
  onRetake: () => void;
}

export function QuizResults({
  score,
  total,
  colorHex,
  sectionHref,
  onRetake,
}: QuizResultsProps) {
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const message =
    percent >= 80
      ? "Great work!"
      : percent >= 50
        ? "Nice effort — review the ones you missed."
        : "Keep practising — you'll get there.";

  return (
    <div className="mx-auto flex max-w-[760px] flex-col items-center px-6 py-16 text-center">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: colorHex }}
      >
        <Award className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-ink-secondary">
        Quiz complete
      </h1>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>
      <p className="mt-6 text-4xl font-extrabold text-ink-secondary">
        {score}
        <span className="text-2xl text-ink-placeholder"> / {total}</span>
      </p>
      <p className="mt-1 text-sm text-ink-muted">{percent}% correct</p>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex h-11 items-center justify-center rounded-md bg-surface-gray px-6 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-input"
        >
          Retake
        </button>
        <Link
          href={sectionHref}
          className="inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: colorHex }}
        >
          Back to section
        </Link>
      </div>
    </div>
  );
}
