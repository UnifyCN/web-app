"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, ArrowRight, Sparkles } from "lucide-react";
import { SelectableLessonContent } from "@/components/learn/SelectableLessonContent";
import { ExplainTermModal } from "@/components/learn/ExplainTermModal";
import { LessonQuiz } from "@/components/learn/practice/LessonQuiz";
import { HelpFab } from "@/components/learn/help/HelpFab";
import { HelpDrawer } from "@/components/learn/help/HelpDrawer";
import { escapeRegExp, portableTextToPlain } from "@/lib/utils";
import { trackHelpOpened, trackLessonPageViewed } from "@/lib/analytics";
import type {
  LessonContext,
  SanityLessonPage,
  SanityQuizQuestion,
} from "@/types";

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
  /** Highlight nav context (stored on each saved highlight for deep-linking). */
  moduleId: string;
  submoduleId: string;
  submoduleTitle: string;
  /** Search term to temporarily highlight in the reader (from `?highlight=`). */
  highlightQuery?: string;
  /** Module name + this lesson's position, for encouraging banners + "next up". */
  moduleTitle?: string;
  isFirstLesson?: boolean;
  isLastLesson?: boolean;
  nextLesson?: { title: string; href: string };
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
  moduleId,
  submoduleId,
  submoduleTitle,
  highlightQuery,
  moduleTitle,
  isFirstLesson,
  isLastLesson,
  nextLesson,
}: LessonPagerProps) {
  const router = useRouter();
  // When arriving from search, open on the first page that contains the term.
  const [pageIndex, setPageIndex] = useState(() => {
    if (!highlightQuery) return 0;
    const re = new RegExp(`\\b${escapeRegExp(highlightQuery)}\\b`, "i");
    const idx = pages.findIndex((p) => re.test(portableTextToPlain(p.content)));
    return idx >= 0 ? idx : 0;
  });
  const [askTerm, setAskTerm] = useState<string | null>(null);
  const [helpOpen, setHelpOpen] = useState(false);

  // The Quick Check is its own trailing screen after the content pages.
  const hasQuiz = quizQuestions.length > 0;
  const totalScreens = pages.length + (hasQuiz ? 1 : 0);
  const index = Math.min(pageIndex, Math.max(0, totalScreens - 1));
  const isQuizPage = hasQuiz && index === pages.length;
  const isLastContentPage = pages.length > 0 && index === pages.length - 1;
  const isLastScreen = index >= totalScreens - 1;
  const currentPage = isQuizPage ? undefined : pages[index];
  const percent = totalScreens > 0 ? ((index + 1) / totalScreens) * 100 : 100;

  // In-Lesson Help context — tracks the page currently on screen so the AI
  // path can scope its answer (rag-query LESSON CONTEXT block). Memoized so the
  // drawer + its effects don't see a new object reference every render.
  const helpLessonContext: LessonContext = useMemo(
    () => ({
      moduleId,
      submoduleId,
      lessonId,
      pageId: currentPage?._key ?? null,
      moduleTitle: moduleTitle ?? "",
      submoduleTitle,
      lessonTitle: title,
    }),
    [
      moduleId,
      submoduleId,
      lessonId,
      currentPage?._key,
      moduleTitle,
      submoduleTitle,
      title,
    ],
  );

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

  // Left/right arrows page through the lesson. Ignored while typing (quiz
  // free-text) or on the Quick Check screen (which has its own controls).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isQuizPage || askTerm || helpOpen) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.isContentEditable)
      ) {
        return;
      }
      if (e.key === "ArrowLeft") {
        e.preventDefault();
        if (index > 0) setPageIndex(index - 1);
        else router.push(sectionHref);
      } else if (e.key === "ArrowRight" && !isLastScreen) {
        e.preventDefault();
        setPageIndex(index + 1);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, isQuizPage, isLastScreen, sectionHref, router, askTerm, helpOpen]);

  // `lesson_page_viewed` per content page (the quiz screen is not a content page;
  // it fires `quiz_completed` instead). Keyed on the screen index — the pager
  // remounts per lesson, so this also fires for the first page on open.
  useEffect(() => {
    if (isQuizPage) return;
    trackLessonPageViewed({
      lessonId,
      submoduleId,
      moduleId,
      pageNumber: index + 1,
      totalPages: pages.length,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId, index, isQuizPage]);

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

      {/* Encouraging banner for the first / last lesson of the module. */}
      {moduleTitle && (isFirstLesson || isLastLesson) && (
        <div
          className="mt-4 flex items-center gap-2 rounded-md px-3 py-2 text-xs font-medium"
          style={{ backgroundColor: "var(--color-primary-bg)", color: colorHex }}
        >
          <Sparkles className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {isFirstLesson
            ? `Welcome to ${moduleTitle}! Let's get started`
            : `Final lesson! You're almost done with ${moduleTitle}`}
        </div>
      )}

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
          <SelectableLessonContent
            blocks={currentPage.content}
            lessonId={lessonId}
            pageKey={currentPage._key}
            pageNum={currentPage.order}
            moduleId={moduleId}
            submoduleId={submoduleId}
            submoduleTitle={submoduleTitle}
            onAskAI={setAskTerm}
            highlightQuery={highlightQuery}
          />
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
              <SelectableLessonContent
                blocks={page.content}
                lessonId={lessonId}
                pageKey={page._key}
                pageNum={page.order}
                moduleId={moduleId}
                submoduleId={submoduleId}
                submoduleTitle={submoduleTitle}
                onAskAI={setAskTerm}
                highlightQuery={highlightQuery}
              />
            </section>
          ))}
        </div>
      )}

      {/* The Quick Check is its own dedicated page — quiz only, no content. */}
      {isQuizPage && (
        <div className="mt-7">
          <LessonQuiz
            lessonId={lessonId}
            moduleId={moduleId}
            submoduleId={submoduleId}
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

      {/* "Next up" suggestion after finishing — completes this lesson, then goes
          straight to the next one. */}
      {!isQuizPage && isLastScreen && nextLesson && (
        <Link
          href={nextLesson.href}
          onClick={onLessonComplete}
          className="mt-3 flex items-center justify-center gap-1.5 text-sm text-ink-muted transition-colors hover:text-primary"
        >
          Next up: <span className="font-semibold">{nextLesson.title}</span>
          <ArrowRight className="h-4 w-4" aria-hidden />
        </Link>
      )}

      <ExplainTermModal
        term={askTerm}
        lessonContext={title}
        onClose={() => setAskTerm(null)}
      />

      {/* In-Lesson Help — floating bubble + chooser drawer (AI / Discussion).
          Hidden while the drawer is open; persists across pages in a lesson. */}
      {!helpOpen && (
        <HelpFab
          onOpen={() => {
            trackHelpOpened({ moduleId, lessonId });
            setHelpOpen(true);
          }}
        />
      )}
      <HelpDrawer
        open={helpOpen}
        lessonContext={helpLessonContext}
        onClose={() => setHelpOpen(false)}
      />
    </div>
  );
}
