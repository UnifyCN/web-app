"use client";

import { useState } from "react";
import { Briefcase, Loader2, Sparkles, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn } from "@/lib/utils";
import { useClearJobPosting, useFetchJobPosting } from "@/hooks/useResume";
import { JobPostingError, ResumeLimitError } from "@/services/resume";
import type { ResumeJobPosting } from "@/types/resume";

interface JobTargetBarProps {
  draftId: string | null;
  jobPosting?: ResumeJobPosting;
  /** True while an AI turn is in flight or the daily limit is reached. */
  disabled: boolean;
  /** Fire a tailoring turn against the current target (owned by the editor page). */
  onTailor: () => void;
}

/**
 * Job-posting target affordance in the resume chat column. Collapsed it's a small
 * "Target a job" pill; expanded it takes a URL (server-fetched + extracted) or a
 * pasted description (the fallback for sites that block scraping). Once a target
 * is set it shows a chip + "Tailor my resume" action. Self-contained: it owns the
 * fetch/clear mutations; the editor owns the tailoring turn.
 */
export function JobTargetBar({
  draftId,
  jobPosting,
  disabled,
  onTailor,
}: JobTargetBarProps) {
  const { t } = useTranslation();
  const fetchMut = useFetchJobPosting();
  const clearMut = useClearJobPosting();

  const [expanded, setExpanded] = useState(false);
  const [mode, setMode] = useState<"url" | "text">("url");
  const [urlValue, setUrlValue] = useState("");
  const [textValue, setTextValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  if (!draftId) return null;

  const busy = fetchMut.isPending;

  function messageForError(err: unknown): string {
    if (err instanceof ResumeLimitError) {
      return t("resume.jobTarget.errors.daily_limit_reached");
    }
    const code = err instanceof JobPostingError ? err.code : "generic";
    const key = `resume.jobTarget.errors.${code}`;
    const msg = t(key);
    return msg === key ? t("resume.jobTarget.errors.generic") : msg;
  }

  async function submit(source: { url: string } | { text: string }) {
    if (!draftId || busy || disabled) return;
    setError(null);
    try {
      await fetchMut.mutateAsync({ draftId, source });
      setExpanded(false);
      setUrlValue("");
      setTextValue("");
    } catch (err) {
      setError(messageForError(err));
    }
  }

  async function handleRemove() {
    if (!draftId) return;
    setError(null);
    try {
      await clearMut.mutateAsync(draftId);
    } catch {
      // Non-fatal: leave the chip; the user can retry.
    }
  }

  // ---- Target set: chip + tailor action --------------------------------
  if (jobPosting) {
    const label = jobPosting.title
      ? jobPosting.company
        ? t("resume.jobTarget.chipWithCompany", {
            title: jobPosting.title,
            company: jobPosting.company,
          })
        : t("resume.jobTarget.chip", { title: jobPosting.title })
      : t("resume.jobTarget.chipPasted");
    return (
      <div className="flex shrink-0 items-center gap-2 border-b border-border-card px-3 py-2">
        <div className="flex min-w-0 flex-1 items-center gap-1.5 rounded-full bg-primary-bg px-3 py-1.5">
          <Briefcase className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-xs font-medium text-primary">{label}</span>
          <button
            type="button"
            onClick={handleRemove}
            disabled={clearMut.isPending || disabled}
            aria-label={t("resume.jobTarget.remove")}
            className="ms-0.5 flex h-4 w-4 shrink-0 cursor-pointer items-center justify-center rounded-full text-primary/70 transition-colors hover:bg-primary/10 hover:text-primary disabled:opacity-50"
          >
            <X className="h-3 w-3" aria-hidden />
          </button>
        </div>
        <button
          type="button"
          onClick={onTailor}
          disabled={disabled}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3 py-1.5 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Sparkles className="h-3.5 w-3.5" aria-hidden />
          {t("resume.jobTarget.tailor")}
        </button>
      </div>
    );
  }

  // ---- Collapsed trigger ------------------------------------------------
  if (!expanded) {
    return (
      <div className="shrink-0 border-b border-border-card px-3 py-2">
        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            setError(null);
            setExpanded(true);
          }}
          className="flex cursor-pointer items-center gap-1.5 rounded-full border border-border-card bg-surface px-3 py-1.5 text-xs font-medium text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Briefcase className="h-3.5 w-3.5" aria-hidden />
          {t("resume.jobTarget.button")}
        </button>
      </div>
    );
  }

  // ---- Expanded input ---------------------------------------------------
  return (
    <div className="shrink-0 space-y-2 border-b border-border-card px-3 py-2.5">
      {mode === "url" ? (
        <div className="flex items-center gap-2">
          <input
            type="url"
            inputMode="url"
            value={urlValue}
            onChange={(e) => setUrlValue(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && urlValue.trim()) submit({ url: urlValue.trim() });
            }}
            placeholder={t("resume.jobTarget.urlPlaceholder")}
            disabled={busy}
            autoFocus
            className="min-w-0 flex-1 rounded-lg border border-border-card bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary disabled:opacity-60"
          />
          <button
            type="button"
            onClick={() => urlValue.trim() && submit({ url: urlValue.trim() })}
            disabled={busy || disabled || !urlValue.trim()}
            className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
            {t("resume.jobTarget.fetch")}
          </button>
        </div>
      ) : (
        <div className="space-y-2">
          <textarea
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            placeholder={t("resume.jobTarget.pastePlaceholder")}
            disabled={busy}
            rows={4}
            autoFocus
            className="scrollbar-thin w-full resize-none rounded-lg border border-border-card bg-surface px-3 py-2 text-sm text-ink outline-none transition-colors focus:border-primary disabled:opacity-60"
          />
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => textValue.trim() && submit({ text: textValue })}
              disabled={busy || disabled || !textValue.trim()}
              className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy && <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />}
              {t("resume.jobTarget.use")}
            </button>
          </div>
        </div>
      )}

      <div className="flex items-center justify-between text-[11px]">
        <button
          type="button"
          onClick={() => {
            setError(null);
            setMode((m) => (m === "url" ? "text" : "url"));
          }}
          disabled={busy}
          className="cursor-pointer font-medium text-primary transition-opacity hover:opacity-80 disabled:opacity-50"
        >
          {mode === "url"
            ? t("resume.jobTarget.pasteToggle")
            : t("resume.jobTarget.urlToggle")}
        </button>
        <button
          type="button"
          onClick={() => {
            setExpanded(false);
            setError(null);
          }}
          disabled={busy}
          className="cursor-pointer text-ink-muted transition-colors hover:text-ink disabled:opacity-50"
        >
          {t("resume.jobTarget.cancel")}
        </button>
      </div>

      {busy && (
        <p className={cn("text-[11px] text-ink-muted")}>{t("resume.jobTarget.fetching")}</p>
      )}
      {error && (
        <p role="alert" className="text-[11px] font-medium text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}
