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
import { buildResumeDocx, resumeDocxFilename } from "@/lib/resume/exportDocx";
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
  const toast = useToast();
  const [exporting, setExporting] = useState(false);
  // Client-only gate for the print portal: hydration-safe (server + first client
  // render agree it's not mounted, then it flips to true after hydration) and
  // avoids a setState-in-effect.
  const mounted = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // PDF: isolated by the @media print block (globals.css) to the .resume-paper
  // node, so it exports selectable, ATS-friendly text via the browser print dialog.
  function handlePdf() {
    window.print();
  }

  // DOCX: build a real, editable Word file client-side (docx is dynamically
  // imported inside buildResumeDocx) and hand it to the browser as a download.
  async function handleDocx() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await buildResumeDocx(data, {
        yourName: t("resume.paper.yourName"),
        summary: t("resume.sections.summary"),
        education: t("resume.sections.education"),
        experience: t("resume.sections.experience"),
        projects: t("resume.sections.projects"),
        skills: t("resume.sections.skills"),
      });
      downloadBlob(blob, resumeDocxFilename(data));
    } catch (err) {
      console.error("Resume: DOCX export failed", err);
      toast.error(t("resume.exportFailed"));
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
        <DropdownMenu
          ariaLabel={t("resume.download")}
          align="end"
          triggerClassName="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          triggerContent={
            <>
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? t("resume.exporting") : t("resume.download")}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          }
          items={[
            {
              key: "pdf",
              label: t("resume.downloadPdf"),
              icon: <FileText className="h-4 w-4" aria-hidden />,
              onSelect: handlePdf,
            },
            {
              key: "docx",
              label: t("resume.downloadDocx"),
              icon: <FileType className="h-4 w-4" aria-hidden />,
              onSelect: handleDocx,
            },
          ]}
        />
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

      {/* Print-only copy: portaled to <body> so PDF export (window.print)
          prints just the resume in normal flow, not the app shell. Hidden on
          screen via `.resume-print-root`; shown only under @media print. */}
      {mounted &&
        createPortal(
          <div className="resume-print-root" aria-hidden>
            <ResumePaper data={data} />
          </div>,
          document.body,
        )}
    </div>
  );
}
