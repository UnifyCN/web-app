"use client";

import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { HelpCircle, Loader2, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { explainTerm } from "@/services/highlights";

interface ExplainTermModalProps {
  /** The selected term to explain. When null, the modal is closed. */
  term: string | null;
  /** Optional lesson title for grounding context. */
  lessonContext?: string;
  onClose: () => void;
}

/**
 * "Ask AI" modal — fetches a short, newcomer-friendly explanation of the
 * selected term from the explain-term edge function. Loading / success / error
 * states with retry, backed by React Query (identical terms are cached).
 */
export function ExplainTermModal({
  term,
  lessonContext,
  onClose,
}: ExplainTermModalProps) {
  const { t } = useTranslation();
  const closeRef = useRef<HTMLButtonElement>(null);

  const query = useQuery({
    queryKey: ["explain-term", term, lessonContext],
    queryFn: () => explainTerm(term as string, lessonContext),
    enabled: !!term,
    retry: false,
    staleTime: Infinity,
    gcTime: 10 * 60 * 1000,
  });

  // Close on Escape while the dialog is open.
  useEffect(() => {
    if (!term) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [term, onClose]);

  // Move focus to the close button on open; restore it to the trigger on close.
  useEffect(() => {
    if (!term) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    return () => previouslyFocused?.focus?.();
  }, [term]);

  if (!term) return null;

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("learnWeb.lesson.explainTermAria")}
    >
      <button
        type="button"
        className="absolute inset-0 cursor-default bg-black/40"
        onClick={onClose}
        aria-label={t("common.close")}
      />
      <div className="relative w-full max-w-md rounded-card border border-border-card bg-surface p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary-bg text-primary">
              <HelpCircle className="h-4 w-4" aria-hidden />
            </span>
            <h2 className="text-base font-bold text-ink-secondary">
              {t("learn.explainTerm.title")}
            </h2>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-ink-placeholder transition-colors hover:bg-surface-gray hover:text-ink"
            aria-label={t("common.close")}
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <p className="mt-3 rounded-md bg-surface-gray px-3 py-2 text-sm italic text-ink-tertiary">
          “{term}”
        </p>

        <div className="mt-3 min-h-16 text-sm leading-relaxed text-ink-secondary">
          {query.isPending || query.isFetching ? (
            <div className="flex items-center gap-2 text-ink-muted">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              {t("learn.explainTerm.gettingExplanation")}
            </div>
          ) : query.isError ? (
            <div className="space-y-2">
              <p className="text-ink-muted">
                {query.error instanceof Error
                  ? query.error.message
                  : t("common.somethingWentWrong")}
              </p>
              <button
                type="button"
                onClick={() => query.refetch()}
                className="rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-white transition-opacity hover:opacity-90"
              >
                {t("learn.explainTerm.tryAgain")}
              </button>
            </div>
          ) : (
            <p>{query.data?.explanation}</p>
          )}
        </div>
      </div>
    </div>
  );
}
