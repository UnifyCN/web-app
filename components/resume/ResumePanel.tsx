"use client";

import { useTranslation } from "react-i18next";
import { buildResumeDocx, resumeDocxFilename } from "@/lib/resume/exportDocx";
import { PreviewPanel } from "@/components/documents/PreviewPanel";
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
}: ResumePanelProps) {
  const { t } = useTranslation();
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
      // DOCX: build a real, editable Word file client-side (docx is dynamically
      // imported inside buildResumeDocx). Section-heading labels come from t() so
      // the DOCX matches the on-screen resume + PDF.
      onExportDocx={() =>
        buildResumeDocx(data, {
          yourName: t("resume.paper.yourName"),
          summary: t("resume.sections.summary"),
          education: t("resume.sections.education"),
          experience: t("resume.sections.experience"),
          projects: t("resume.sections.projects"),
          skills: t("resume.sections.skills"),
        })
      }
      docxFilename={resumeDocxFilename(data)}
      printRootClassName="resume-print-root"
      paper={
        <ResumePaper
          data={data}
          editable={editable}
          disabled={editDisabled}
          onChange={onEditResume}
        />
      }
      printPaper={<ResumePaper data={data} />}
    />
  );
}
