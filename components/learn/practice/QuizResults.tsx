"use client";

import Link from "next/link";
import { Award } from "lucide-react";
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();
  const percent = total > 0 ? Math.round((score / total) * 100) : 0;
  const message =
    percent >= 80
      ? t("learnWeb.practice.resultGreat")
      : percent >= 50
        ? t("learnWeb.practice.resultNice")
        : t("learnWeb.practice.resultKeep");

  return (
    <div className="mx-auto flex max-w-[760px] flex-col items-center px-6 py-16 text-center">
      <span
        className="flex h-16 w-16 items-center justify-center rounded-full text-white"
        style={{ backgroundColor: colorHex }}
      >
        <Award className="h-8 w-8" aria-hidden />
      </span>
      <h1 className="mt-5 text-2xl font-bold text-ink-secondary">
        {t("learnWeb.practice.quizComplete")}
      </h1>
      <p className="mt-2 text-sm text-ink-muted">{message}</p>
      <p className="mt-6 text-4xl font-extrabold text-ink-secondary">
        {score}
        <span className="text-2xl text-ink-placeholder"> / {total}</span>
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        {t("learnWeb.practice.percentCorrect", { percent })}
      </p>

      <div className="mt-8 flex items-center gap-3">
        <button
          type="button"
          onClick={onRetake}
          className="inline-flex h-11 items-center justify-center rounded-md bg-surface-gray px-6 text-sm font-semibold text-ink-secondary transition-colors hover:bg-surface-input"
        >
          {t("learnWeb.practice.retake")}
        </button>
        <Link
          href={sectionHref}
          className="inline-flex h-11 items-center justify-center rounded-md px-6 text-sm font-semibold text-white transition-opacity hover:opacity-90"
          style={{ backgroundColor: colorHex }}
        >
          {t("learnWeb.pager.backToSection")}
        </Link>
      </div>
    </div>
  );
}
