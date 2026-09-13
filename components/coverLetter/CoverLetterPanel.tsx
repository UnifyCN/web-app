"use client";

import { useTranslation } from "react-i18next";
import {
  buildCoverLetterDocx,
  coverLetterDocxFilename,
} from "@/lib/coverLetter/exportDocx";
import { PreviewPanel } from "@/components/documents/PreviewPanel";
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
  return (
    <PreviewPanel
      isEmpty={isEmpty}
      complete={complete}
      editable={editable}
      mobileActive={mobileActive}
      onBackToChat={onBackToChat}
      backLabel={t("coverLetter.backToChat")}
      templateName={t("coverLetter.templateName")}
      readyLabel={t("coverLetter.ready")}
      downloadLabel={t("coverLetter.download")}
      exportingLabel={t("coverLetter.exporting")}
      downloadPdfLabel={t("coverLetter.downloadPdf")}
      downloadDocxLabel={t("coverLetter.downloadDocx")}
      editHint={t("coverLetter.edit.hint")}
      buildingHint={t("coverLetter.buildingHint")}
      exportFailedLabel={t("coverLetter.exportFailed")}
      exportErrorLog="Cover letter: DOCX export failed"
      onExportDocx={() => buildCoverLetterDocx(data)}
      docxFilename={coverLetterDocxFilename(data)}
      printRootClassName="cover-letter-print-root"
      paper={
        <CoverLetterPaper
          data={data}
          editable={editable}
          disabled={editDisabled}
          onChange={onEditLetter}
        />
      }
      printPaper={<CoverLetterPaper data={data} />}
    />
  );
}
