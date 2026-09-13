"use client";

import type { ReactNode } from "react";
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
import { cn, RTL_FLIP, downloadBlob } from "@/lib/utils";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { useToast } from "@/components/ui/ToastProvider";

export interface PreviewPanelProps {
  isEmpty: boolean;
  complete: boolean;
  /** True when a draft is active — the on-screen document is inline-editable. */
  editable: boolean;
  /** Mobile master/detail: is the document the visible pane (vs the chat)? */
  mobileActive: boolean;
  onBackToChat: () => void;

  /* Copy — all already translated by the feature wrapper. */
  backLabel: string;
  templateName: string;
  readyLabel: string;
  downloadLabel: string;
  exportingLabel: string;
  downloadPdfLabel: string;
  downloadDocxLabel: string;
  editHint: string;
  buildingHint: string;
  /** Toast shown when a DOCX export throws. */
  exportFailedLabel: string;
  /** console.error prefix for a failed DOCX export (dev log). */
  exportErrorLog: string;

  /* DOCX export plumbing — the panel owns the download, the feature owns the build. */
  onExportDocx: () => Promise<Blob>;
  docxFilename: string;

  /** Print-root class hook ("resume-print-root" | "cover-letter-print-root"). */
  printRootClassName: string;

  /** Inline-editable paper for the scroll area. */
  paper: ReactNode;
  /** Read-only paper portaled to <body> for PDF print. */
  printPaper: ReactNode;
}

/**
 * Shared preview-panel chrome for the document builders (Resume Builder + Cover
 * Letter Generator). It owns the toolbar (back button, template name, "ready"
 * badge, PDF/DOCX export menu), the `window.print()` PDF flow, and the
 * hydration-safe print portal. The per-feature paper render + all copy are
 * injected via props/slots, so there are no feature branches here.
 */
export function PreviewPanel({
  isEmpty,
  complete,
  editable,
  mobileActive,
  onBackToChat,
  backLabel,
  templateName,
  readyLabel,
  downloadLabel,
  exportingLabel,
  downloadPdfLabel,
  downloadDocxLabel,
  editHint,
  buildingHint,
  exportFailedLabel,
  exportErrorLog,
  onExportDocx,
  docxFilename,
  printRootClassName,
  paper,
  printPaper,
}: PreviewPanelProps) {
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

  // PDF: isolated by the @media print block (globals.css) to the printed paper
  // node, so it exports selectable, ATS-friendly text via the browser print dialog.
  function handlePdf() {
    window.print();
  }

  // DOCX: the feature builds a real, editable Word file client-side (docx is
  // dynamically imported inside the builder) and we hand it to the browser.
  async function handleDocx() {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await onExportDocx();
      downloadBlob(blob, docxFilename);
    } catch (err) {
      console.error(exportErrorLog, err);
      toast.error(exportFailedLabel);
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
            aria-label={backLabel}
            className="-ms-1 flex h-10 w-10 shrink-0 cursor-pointer items-center justify-center rounded-lg text-ink-muted transition-colors hover:bg-surface-gray hover:text-ink md:hidden"
          >
            <ArrowLeft className={cn("h-5 w-5", RTL_FLIP)} aria-hidden />
          </button>
          <span className="truncate text-sm font-semibold text-ink-secondary">
            {templateName}
          </span>
          {complete && (
            <span className="hidden items-center gap-1 rounded-full bg-priority-optional-bg px-2 py-0.5 text-[11px] font-medium text-priority-optional sm:flex">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {readyLabel}
            </span>
          )}
        </div>
        <DropdownMenu
          ariaLabel={downloadLabel}
          align="end"
          triggerClassName="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-primary-dark"
          triggerContent={
            <>
              <Download className="h-4 w-4" aria-hidden />
              {exporting ? exportingLabel : downloadLabel}
              <ChevronDown className="h-3.5 w-3.5" aria-hidden />
            </>
          }
          items={[
            {
              key: "pdf",
              label: downloadPdfLabel,
              icon: <FileText className="h-4 w-4" aria-hidden />,
              onSelect: handlePdf,
            },
            {
              key: "docx",
              label: downloadDocxLabel,
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
            {editHint}
          </p>
        ) : isEmpty ? (
          <p className="mx-auto mb-4 max-w-[816px] text-center text-xs text-ink-placeholder">
            {buildingHint}
          </p>
        ) : null}
        {paper}
      </div>

      {/* Print-only copy: portaled to <body> so PDF export (window.print)
          prints just the document in normal flow, not the app shell. Hidden on
          screen via the print-root class; shown only under @media print. */}
      {mounted &&
        createPortal(
          <div className={printRootClassName} aria-hidden>
            {printPaper}
          </div>,
          document.body,
        )}
    </div>
  );
}
