"use client";

import { useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import {
  ArrowLeft,
  CheckCircle2,
  ChevronDown,
  Download,
  FileText,
  FileType,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { cn, RTL_FLIP, downloadBlob } from "@/lib/utils";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/ToastProvider";
import {
  buildCoverLetterDocx,
  coverLetterDocxFilename,
} from "@/lib/coverLetter/exportDocx";
import { CoverLetterPaper } from "./CoverLetterPaper";
import type { CoverLetterUpdater } from "@/lib/coverLetter/editOps";
import type { CoverLetterData } from "@/types/coverLetter";

interface CoverLetterPanelProps {
  data: CoverLetterData;
  isEmpty: boolean;
  complete: boolean;
  /** True when a draft is active — the on-screen letter becomes inline-editable. */
  editable: boolean;
  /** True while an AI turn is in flight — blocks edits without flipping layout. */
  editDisabled: boolean;
  onEditLetter: (update: CoverLetterUpdater) => void;
  /** Mobile master/detail: is the letter the visible pane (vs the chat)? */
  mobileActive: boolean;
  onBackToChat: () => void;
}

export function CoverLetterPanel({
  data,
  isEmpty,
  complete,
  editable,
  editDisabled,
  onEditLetter,
  mobileActive,
  onBackToChat,
}: CoverLetterPanelProps) {
  const { t } = useTranslation();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  // Client-only gate for the print portal (hydration-safe).
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // PDF: isolated by the @media print block (globals.css) to the
  // .cover-letter-paper node — selectable, ATS-friendly text.
  function handlePdf() {
    window.print();
  }

  async function handleDocx() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await buildCoverLetterDocx(data);
      downloadBlob(blob, coverLetterDocxFilename(data));
    } catch (err) {
      console.error("Cover letter: DOCX export failed", err);
      toast.error(t("coverLetter.exportFailed"));
    } finally {
      setExporting(false);
    }
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
            aria-label={t("coverLetter.backToChat")}
            className="-ms-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink md:hidden"
          >
            <ArrowLeft className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold text-ink-secondary">
            {t("coverLetter.templateName")}
          </span>
          {complete && (
            <span className="hidden items-center gap-1 rounded-full bg-priority-optional-bg px-2 py-0.5 text-[11px] font-medium text-priority-optional sm:flex">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t("coverLetter.ready")}
            </span>
          )}
        </div>
        <DropdownMenu
          ariaLabel={t("coverLetter.download")}
          align="end"
          triggerClassName="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          triggerContent={
            <>
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? t("coverLetter.exporting") : t("coverLetter.download")}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          }
          items={[
            {
              key: "pdf",
              label: t("coverLetter.downloadPdf"),
              icon: <FileText className="h-4 w-4" aria-hidden />,
              onSelect: handlePdf,
            },
            {
              key: "docx",
              label: t("coverLetter.downloadDocx"),
              icon: <FileType className="h-4 w-4" aria-hidden />,
              onSelect: handleDocx,
            },
          ]}
        />
      </header>

      {/* Scrollable paper — on-screen copy is inline-editable. */}
      <div className="scrollbar-thin flex-1 overflow-y-auto px-3 py-5 sm:px-6 sm:py-8">
        {editable ? (
          <p className="mx-auto mb-3 max-w-[816px] text-center text-xs text-ink-placeholder">
            {t("coverLetter.edit.hint")}
          </p>
        ) : isEmpty ? (
          <p className="mx-auto mb-4 max-w-[816px] text-center text-xs text-ink-placeholder">
            {t("coverLetter.buildingHint")}
          </p>
        ) : null}
        <CoverLetterPaper
          data={data}
          editable={editable}
          disabled={editDisabled}
          onChange={onEditLetter}
        />
      </div>

      {/* Print-only copy: portaled to <body> so PDF export (window.print)
          prints just the letter, not the app shell. Hidden on screen via
          `.cover-letter-print-root`; shown only under @media print. */}
      {mounted &&
        createPortal(
          <div className="cover-letter-print-root" aria-hidden>
            <CoverLetterPaper data={data} />
          </div>,
          document.body,
        )}
    </div>
  );
}
