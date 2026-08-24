"use client";

import { ArrowLeft, CheckCircle2, Download } from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, RTL_FLIP } from "@/lib/utils";
import { ResumePaper } from "./ResumePaper";
import type { ResumeData } from "@/types/resume";

interface ResumePanelProps {
  data: ResumeData;
  isEmpty: boolean;
  complete: boolean;
  /** Mobile master/detail: is the resume the visible pane (vs the chat)? */
  mobileActive: boolean;
  onBackToChat: () => void;
}

export function ResumePanel({
  data,
  isEmpty,
  complete,
  mobileActive,
  onBackToChat,
}: ResumePanelProps) {
  const { t } = useTranslation();

  // Isolated by the print stylesheet (globals.css @media print) to the
  // .resume-paper node, so this exports selectable, ATS-friendly text.
  function handleDownload() {
    window.print();
  }

  return (
    <div
      className={cn(
        "h-full min-w-0 flex-1 flex-col bg-surface-card md:flex",
        mobileActive ? "flex" : "hidden",
      )}
    >
      {/* Toolbar */}
      <header className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border-card bg-surface px-3 md:px-5">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onBackToChat}
            aria-label={t("resume.backToChat")}
            className="-ms-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink md:hidden"
          >
            <ArrowLeft className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold text-ink-secondary">
            {t("resume.templateName")}
          </span>
          {complete && (
            <span className="hidden items-center gap-1 rounded-full bg-priority-optional-bg px-2 py-0.5 text-[11px] font-medium text-priority-optional sm:flex">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t("resume.ready")}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={handleDownload}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
        >
          <Download className="h-4 w-4" aria-hidden />
          {t("resume.downloadPdf")}
        </button>
      </header>

      {/* Scrollable paper */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
        {isEmpty && (
          <p className="mx-auto mb-4 max-w-[816px] text-center text-xs text-ink-placeholder">
            {t("resume.buildingHint")}
          </p>
        )}
        <ResumePaper data={data} />
      </div>
    </div>
  );
}
