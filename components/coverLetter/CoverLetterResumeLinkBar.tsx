"use client";

import { FileText } from "lucide-react";
import { useTranslation } from "react-i18next";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { useResumeDrafts } from "@/hooks/useResume";
import { useSetResumeLink } from "@/hooks/useCoverLetter";

interface CoverLetterResumeLinkBarProps {
  draftId: string | null;
  /** The currently linked resume draft id, if any. */
  resumeDraftId?: string;
  /** Disable changing the link while a turn is in flight. */
  disabled: boolean;
}

/**
 * Shows which resume is linked as context for the letter, with a picker to change
 * it (or unlink). Hidden entirely when the user has no resumes and none is linked.
 * The linked resume's content is fed to the generator so the letter stays
 * consistent with the user's real experience.
 */
export function CoverLetterResumeLinkBar({
  draftId,
  resumeDraftId,
  disabled,
}: CoverLetterResumeLinkBarProps) {
  const { t } = useTranslation();
  const resumesQuery = useResumeDrafts();
  const setLink = useSetResumeLink();
  const resumes = resumesQuery.data ?? [];

  if (!draftId) return null;
  // Nothing to offer and nothing linked → don't clutter the column.
  if (resumes.length === 0 && !resumeDraftId) return null;

  const linked = resumes.find((r) => r.id === resumeDraftId);
  const label = linked
    ? t("coverLetter.resumeLink.using", { title: linked.title })
    : t("coverLetter.resumeLink.none");

  const items = [
    ...resumes.map((r) => ({
      key: r.id,
      label: r.title,
      icon: <FileText className="h-4 w-4" aria-hidden />,
      onSelect: () =>
        setLink.mutate({ draftId, resumeDraftId: r.id }),
    })),
    {
      key: "__none__",
      label: t("coverLetter.resumeLink.dontUse"),
      onSelect: () => setLink.mutate({ draftId, resumeDraftId: null }),
    },
  ];

  return (
    <div className="flex shrink-0 items-center gap-2 border-b border-border-card px-3 py-1.5">
      <FileText className="h-3.5 w-3.5 shrink-0 text-ink-placeholder" aria-hidden />
      <span className="min-w-0 flex-1 truncate text-[11px] text-ink-muted">
        {label}
      </span>
      {/* Hide the picker while a turn is generating so a link change can't race
          the turn's write. */}
      {!disabled && (
        <DropdownMenu
          ariaLabel={t("coverLetter.resumeLink.change")}
          align="end"
          triggerClassName="shrink-0 cursor-pointer rounded-full px-2 py-0.5 text-[11px] font-medium text-primary transition-colors hover:bg-primary-bg"
          triggerContent={<>{t("coverLetter.resumeLink.change")}</>}
          items={items}
        />
      )}
    </div>
  );
}
