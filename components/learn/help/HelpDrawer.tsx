"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowLeft, Sparkles, Users, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { trackHelpPathSelected } from "@/lib/analytics";
import { cn } from "@/lib/utils";
import { HelpChooser } from "./HelpChooser";
import { InLessonChat } from "./InLessonChat";
import { DiscussionBoard } from "./DiscussionBoard";
import type { LessonContext } from "@/types";

type HelpView = "chooser" | "ai" | "discussion";

/**
 * In-Lesson Help drawer (PRD R2) — a right-side slide-in panel over the lesson
 * reader hosting the chooser and both help paths. Stays mounted while hidden
 * so the AI conversation and board filters survive close/reopen within a
 * lesson; closing never navigates, so the reader position is untouched.
 * Back arrows return to the chooser; Esc/backdrop close the drawer.
 */
export function HelpDrawer({
  open,
  lessonContext,
  onClose,
}: {
  open: boolean;
  lessonContext: LessonContext;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [view, setView] = useState<HelpView>("chooser");
  // Owned here (not in InLessonChat) so revisiting the AI path continues the
  // same conversation instead of spawning a new row per visit.
  const [aiConversationId, setAiConversationId] = useState<string | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  // Only mount path content after first open — the drawer sits in every
  // lesson page, and the board/stats queries shouldn't fire until asked for.
  // Previous-prop pattern (see ReportModal) so we never setState in an effect.
  const [everOpened, setEverOpened] = useState(open);
  if (open && !everOpened) setEverOpened(true);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // Trap Tab / Shift+Tab within the drawer so focus can't escape to the
      // lesson underneath while the modal is open.
      if (event.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          event.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey && active === first) {
          event.preventDefault();
          last.focus();
        } else if (!event.shiftKey && active === last) {
          event.preventDefault();
          first.focus();
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  function selectPath(path: "ai" | "community") {
    trackHelpPathSelected({
      path,
      moduleId: lessonContext.moduleId,
      lessonId: lessonContext.lessonId,
    });
    setView(path === "ai" ? "ai" : "discussion");
  }

  const header: Record<
    HelpView,
    { title: string; subtitle?: string; icon?: React.ReactNode }
  > = {
    chooser: { title: t("learnWeb.help.chooserTitle") },
    ai: {
      title: t("learnWeb.help.aiTitle"),
      subtitle: t("learnWeb.help.aiSubtitle"),
      icon: (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-600 text-white">
          <Sparkles className="h-4 w-4" aria-hidden />
        </span>
      ),
    },
    discussion: {
      title: t("learnWeb.help.communityTitle"),
      subtitle: lessonContext.moduleTitle,
      icon: (
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-purple-600 text-white">
          <Users className="h-4 w-4" aria-hidden />
        </span>
      ),
    },
  };

  return (
    <div
      aria-hidden={!open}
      className={cn("fixed inset-0 z-50", !open && "pointer-events-none")}
    >
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden
        className={cn(
          "absolute inset-0 bg-black/30 transition-opacity duration-200 motion-reduce:transition-none",
          open ? "opacity-100" : "opacity-0",
        )}
      />

      {/* Panel */}
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={t("learnWeb.help.chooserTitle")}
        className={cn(
          "absolute inset-y-0 right-0 flex w-full flex-col bg-surface shadow-xl sm:max-w-[420px] sm:border-l sm:border-border-card",
          "transition-transform duration-200 motion-reduce:transition-none",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        {/* Header */}
        <header className="flex h-14 shrink-0 items-center gap-2 border-b border-border-card px-4">
          {view !== "chooser" && (
            <button
              type="button"
              onClick={() => setView("chooser")}
              aria-label={t("learnWeb.help.backToOptionsAria")}
              className="-ml-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              <ArrowLeft className="h-5 w-5" aria-hidden />
            </button>
          )}
          {header[view].icon}
          <div className="min-w-0 flex-1">
            <h2 className="truncate text-sm font-bold text-ink-secondary">
              {header[view].title}
            </h2>
            {header[view].subtitle && (
              <p className="truncate text-xs text-ink-placeholder">
                {header[view].subtitle}
              </p>
            )}
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label={t("learnWeb.help.closeAria")}
            className="-mr-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X className="h-5 w-5" aria-hidden />
          </button>
        </header>

        {/* Body */}
        {everOpened && (
          <>
            {view === "chooser" && (
              <div className="scrollbar-thin min-h-0 flex-1 overflow-y-auto">
                <HelpChooser
                  lessonContext={lessonContext}
                  onSelect={selectPath}
                />
              </div>
            )}
            {view === "ai" && (
              <InLessonChat
                lessonContext={lessonContext}
                conversationId={aiConversationId}
                onConversationCreated={setAiConversationId}
              />
            )}
            {view === "discussion" && (
              <DiscussionBoard lessonContext={lessonContext} />
            )}
          </>
        )}
      </div>
    </div>
  );
}
