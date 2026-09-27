"use client";

import { useTranslation } from "react-i18next";
import {
  buildResumeDocx,
  resumeDocxFilename,
  resumeDocxLabels,
} from "@/lib/resume/exportDocx";
import { PreviewPanel } from "@/components/documents/PreviewPanel";
import { useDocumentLanguage } from "@/hooks/useDocumentLanguage";
import { documentT } from "@/lib/documents/documentLanguage";
import { trackResumeExported } from "@/lib/analytics";
import { ResumePaper } from "./ResumePaper";
import type { ResumeUpdater } from "@/lib/resume/editOps";
import type { ResumeData } from "@/types/resume";

interface ResumePanelProps {
  data: ResumeData;
  isEmpty: boolean;
  complete: boolean;
  /** True when a draft is active — the on-screen resume becomes inline-editable. */
  editable: boolean;
  /** True while an AI turn is in flight — blocks edits without flipping layout. */
  editDisabled: boolean;
  /** Commit a manual inline edit (a functional update on the resume). */
  onEditResume: (update: ResumeUpdater) => void;
  /** Mobile master/detail: is the resume the visible pane (vs the chat)? */
  mobileActive: boolean;
  onBackToChat: () => void;
  /** Keys the remembered export language (per draft). */
  draftId: string;
}

export function ResumePanel({
  data,
  isEmpty,
  complete,
  editable,
  editDisabled,
  onEditResume,
  mobileActive,
  onBackToChat,
  draftId,
}: ResumePanelProps) {
  const { t, i18n } = useTranslation();
  // Exports follow the document language (English by default), not the UI.
  const [docLang, setDocLang] = useDocumentLanguage("resume", draftId);
  return (
    <PreviewPanel
      isEmpty={isEmpty}
      complete={complete}
      editable={editable}
      mobileActive={mobileActive}
      onBackToChat={onBackToChat}
      backLabel={t("resume.backToChat")}
      templateName={t("resume.templateName")}
      readyLabel={t("resume.ready")}
      downloadLabel={t("resume.download")}
      exportingLabel={t("resume.exporting")}
      downloadPdfLabel={t("resume.downloadPdf")}
      downloadDocxLabel={t("resume.downloadDocx")}
      editHint={t("resume.edit.hint")}
      buildingHint={t("resume.buildingHint")}
      exportFailedLabel={t("resume.exportFailed")}
      exportErrorLog="Resume: DOCX export failed"
      onExported={(format) => trackResumeExported({ format })}
      // DOCX: build a real, editable Word file client-side (docx is dynamically
      // imported inside buildResumeDocx). Section headings resolve in the
      // document language so the DOCX matches the PDF.
      onExportDocx={() =>
        buildResumeDocx(
          data,
          resumeDocxLabels(documentT(i18n, docLang)),
          docLang,
        )
      }
      docxFilename={resumeDocxFilename(data)}
      documentLanguage={docLang}
      onDocumentLanguageChange={setDocLang}
      documentLanguageLabel={t("resume.documentLanguage")}
      printRootClassName="resume-print-root"
      paper={
        <ResumePaper
          data={data}
          editable={editable}
          disabled={editDisabled}
          onChange={onEditResume}
        />
      }
      printPaper={<ResumePaper data={data} docLang={docLang} />}
    />
  );
}
