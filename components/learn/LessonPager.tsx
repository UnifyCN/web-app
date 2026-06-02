"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { PortableTextRenderer } from "@/components/learn/PortableTextRenderer";
import { LessonQuiz } from "@/components/learn/practice/LessonQuiz";
import type { SanityLessonPage, SanityQuizQuestion } from "@/types";

interface LessonPagerProps {
  lessonId: string;
  title: string;
  description?: string | null;
  pages: SanityLessonPage[];
  endingPages: SanityLessonPage[];
  colorHex: string;
  quizTitle: string;
  quizQuestions: SanityQuizQuestion[];
  /** Fired when the lesson content is finished (marks the lesson complete). */
  onLessonComplete: () => void;
  /** The submodule page — "Back" exits here, and finishing always returns here. */
  sectionHref: string;
}

/**
 * Paginates a lesson's `pages[]` one screen at a time (Back/Next + progress bar,
 * lesson title as a persistent header). The ending pages and the inline Quick
 * Check appear on the last page. Held as a child keyed by lessonId so its
 * `pageIndex` resets when the lesson changes.
 */
export function LessonPager({
  lessonId,
  title,
  description,
  pages,
  endingPages,
  colorHex,
  quizTitle,
  quizQuestions,
  onLessonComplete,
  sectionHref,
}: LessonPagerProps) {
  const router = useRouter();
  const [pageIndex, setPageIndex] = useState(0);

  // The Quick Check is its own trailing screen after the content pages.
  const hasQuiz = quizQuestions.length > 0;
  const totalScreens = pages.length + (hasQuiz ? 1 : 0);
  const index = Math.min(pageIndex, Math.max(0, totalScreens - 1));
  const isQuizPage = hasQuiz && index === pages.length;
  const isLastContentPage = pages.length > 0 && index === pages.length - 1;
  const isLastScreen = index >= totalScreens - 1;
  const currentPage = isQuizPage ? undefined : pages[index];
  const percent = totalScreens > 0 ? ((index + 1) / totalScreens) * 100 : 100;

  function handleBack() {
    if (index > 0) setPageIndex(index - 1);
    else router.push(sectionHref);
  }

  function handleNext() {
    // The lesson is marked complete when the quiz is finished (LessonQuiz's Done)
    // or, for quiz-less lessons, via the last-screen "Back to section" link — not
    // on merely reaching the quiz page.
    setPageIndex(index + 1);
  }

  return (
    <div>
      {/* Persistent header: lesson title + page progress */}
      <h1 className="text-2xl font-bold text-ink-secondary">{title}</h1>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-surface-input">
        <div
          className="h-full rounded-full"
          style={{ width: `${percent}%`, backgroundColor: colorHex }}
        />
      </div>

      {/* Current page */}
      {currentPage && (
        <section className="mt-7">
          {index === 0 && description && (
            <p className="mb-5 text-sm leading-relaxed text-ink-muted">
              {description}
            </p>
          )}
          {currentPage.title && (
            <h2 className="mb-3 text-lg font-bold text-ink-secondary">
              {currentPage.title}
            </h2>
          )}
          <PortableTextRenderer value={currentPage.content} />
        </section>
      )}

      {/* Ending pages live on the last content page. */}
      {isLastContentPage && endingPages.length > 0 && (
        <div className="mt-8 border-t border-border-card pt-6">
          {endingPages.map((page) => (
            <section key={page._key} className="mt-4 first:mt-0">
              {page.title && (
                <h2 className="mb-3 text-lg font-bold text-ink-secondary">
                  {page.title}
                </h2>
              )}
              <PortableTextRenderer value={page.content} />
            </section>
          ))}
        </div>
      )}

      {/* The Quick Check is its own dedicated page — quiz only, no content. */}
      {isQuizPage && (
        <div className="mt-7">
          <LessonQuiz
            lessonId={lessonId}
            title={quizTitle}
            questions={quizQuestions}
            colorHex={colorHex}
            onLessonComplete={onLessonComplete}
            sectionHref={sectionHref}
          />
        </div>
      )}

      {/* Bottom nav — hidden on the Quick Check page (the quiz has its own nav). */}
      {!isQuizPage && (
        <nav className="mt-10 flex items-center gap-3 border-t border-border-card pt-6">
          <button
            type="button"
            onClick={handleBack}
            className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md bg-surface-gray text-sm font-semibold text-ink-tertiary transition-colors hover:bg-surface-input"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            Back
          </button>
          {isLastScreen ? (
            <Link
              href={sectionHref}
              onClick={onLessonComplete}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: colorHex }}
            >
              Back to section
              <ArrowRight className="h-4 w-4" aria-hidden />
            </Link>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              className="inline-flex h-11 flex-1 items-center justify-center gap-1.5 rounded-md text-sm font-semibold text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: colorHex }}
            >
              Next
              <ArrowRight className="h-4 w-4" aria-hidden />
            </button>
          )}
        </nav>
      )}
    </div>
  );
}
