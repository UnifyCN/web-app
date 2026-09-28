"use client";

import { useTranslation } from "react-i18next";
import {
  buildCoverLetterDocx,
  coverLetterDocxFilename,
} from "@/lib/coverLetter/exportDocx";
import { PreviewPanel } from "@/components/documents/PreviewPanel";
import { useDocumentLanguage } from "@/hooks/useDocumentLanguage";
import { trackCoverLetterExported } from "@/lib/analytics";
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
  /** Keys the remembered export language (per draft). */
  draftId: string;
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
  draftId,
}: CoverLetterPanelProps) {
  const { t } = useTranslation();
  // Exports follow the document language (English by default), not the UI.
  const [docLang, setDocLang] = useDocumentLanguage("coverLetter", draftId);
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
      onExported={(format) => trackCoverLetterExported({ format })}
      onExportDocx={() => buildCoverLetterDocx(data, docLang)}
      docxFilename={coverLetterDocxFilename(data)}
      documentLanguage={docLang}
      onDocumentLanguageChange={setDocLang}
      documentLanguageLabel={t("coverLetter.documentLanguage")}
      printRootClassName="cover-letter-print-root"
      paper={
        <CoverLetterPaper
          data={data}
          editable={editable}
          disabled={editDisabled}
          onChange={onEditLetter}
        />
      }
      printPaper={<CoverLetterPaper data={data} docLang={docLang} />}
    />
  );
}
