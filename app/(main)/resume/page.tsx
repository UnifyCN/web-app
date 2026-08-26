"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import {
  CheckCircle2,
  Copy,
  FileText,
  Pencil,
  Plus,
  Trash2,
} from "lucide-react";
import { formatRelativeTime } from "@/lib/utils";
import { DropdownMenu } from "@/components/ui/DropdownMenu";
import { ModalShell } from "@/components/ui/ModalShell";
import { ConfirmModal } from "@/components/ui/ConfirmModal";
import {
  useCreateResumeDraft,
  useDeleteResumeDraft,
  useDuplicateDraft,
  useRenameDraft,
  useResumeDrafts,
  useResumeUsage,
} from "@/hooks/useResume";
import { RESUME_DAILY_MESSAGE_LIMIT } from "@/lib/resume/schema";
import type { ResumeDraftSummary } from "@/types/resume";

/**
 * "My Resumes" — the management home for the resume builder. Lists the user's
 * resume_drafts (open / rename / duplicate / delete) and creates new ones. Each
 * resume is edited at /resume/[draftId].
 */
export default function MyResumesPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const draftsQuery = useResumeDrafts();
  const drafts = draftsQuery.data ?? [];
  const usageQuery = useResumeUsage();
  const remaining = usageQuery.data?.remaining ?? RESUME_DAILY_MESSAGE_LIMIT;

  const createDraft = useCreateResumeDraft();
  const renameDraft = useRenameDraft();
  const duplicateDraft = useDuplicateDraft();
  const deleteDraft = useDeleteResumeDraft();

  const [renaming, setRenaming] = useState<ResumeDraftSummary | null>(null);
  const [deleting, setDeleting] = useState<ResumeDraftSummary | null>(null);

  async function handleCreate() {
    if (createDraft.isPending) return;
    try {
      const created = await createDraft.mutateAsync();
      router.push(`/resume/${created.id}`);
    } catch (err) {
      console.error("Resume: failed to create draft", err);
    }
  }

  async function handleDuplicate(d: ResumeDraftSummary) {
    try {
      const copy = await duplicateDraft.mutateAsync({
        id: d.id,
        title: t("resume.list.copyOf", { title: d.title }),
      });
      router.push(`/resume/${copy.id}`);
    } catch (err) {
      console.error("Resume: failed to duplicate draft", err);
    }
  }

  async function handleRename(title: string) {
    const target = renaming;
    if (!target) return;
    const trimmed = title.trim();
    if (!trimmed || trimmed === target.title) {
      setRenaming(null);
      return;
    }
    try {
      await renameDraft.mutateAsync({ id: target.id, title: trimmed });
    } catch (err) {
      console.error("Resume: failed to rename draft", err);
    } finally {
      setRenaming(null);
    }
  }

  async function handleDelete() {
    if (!deleting) return;
    try {
      await deleteDraft.mutateAsync(deleting.id);
    } catch (err) {
      console.error("Resume: failed to delete draft", err);
    } finally {
      setDeleting(null);
    }
  }

  const isEmpty = draftsQuery.isSuccess && drafts.length === 0;

  return (
    <div className="mx-auto w-full max-w-4xl animate-fade-in px-4 py-6 sm:px-6 sm:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-ink-secondary">
            {t("resume.list.title")}
          </h1>
          <p className="mt-1 text-sm text-ink-muted">
            {t("resume.messagesRemaining", { count: remaining })}
          </p>
        </div>
        <button
          type="button"
          onClick={handleCreate}
          disabled={createDraft.isPending}
          className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
        >
          <Plus className="h-4 w-4" aria-hidden />
          {t("resume.newResume")}
        </button>
      </header>

      {draftsQuery.isLoading ? (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className="h-[92px] animate-pulse rounded-lg border border-border-card bg-surface-card"
            />
          ))}
        </div>
      ) : isEmpty ? (
        <EmptyState onCreate={handleCreate} creating={createDraft.isPending} />
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          {drafts.map((d) => (
            <ResumeCard
              key={d.id}
              draft={d}
              onOpen={() => router.push(`/resume/${d.id}`)}
              onRename={() => setRenaming(d)}
              onDuplicate={() => handleDuplicate(d)}
              onDelete={() => setDeleting(d)}
            />
          ))}
        </ul>
      )}

      {renaming && (
        <RenameDialog
          initialTitle={renaming.title}
          busy={renameDraft.isPending}
          onSave={handleRename}
          onCancel={() => setRenaming(null)}
        />
      )}
      <ConfirmModal
        open={deleting !== null}
        title={t("resume.list.deleteTitle")}
        description={
          deleting ? t("resume.list.deleteConfirm", { title: deleting.title }) : undefined
        }
        confirmLabel={t("resume.list.delete")}
        isPending={deleteDraft.isPending}
        onConfirm={handleDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  );
}

function ResumeCard({
  draft,
  onOpen,
  onRename,
  onDuplicate,
  onDelete,
}: {
  draft: ResumeDraftSummary;
  onOpen: () => void;
  onRename: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
}) {
  const { t } = useTranslation();
  return (
    <li className="group relative rounded-lg border border-border-card bg-surface-card transition-colors hover:border-primary/40">
      <button
        type="button"
        onClick={onOpen}
        className="block w-full cursor-pointer rounded-lg p-4 pe-11 text-start"
      >
        <span className="flex items-center gap-1.5">
          <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden />
          <span className="truncate text-sm font-semibold text-ink-secondary">
            {draft.title}
          </span>
        </span>
        <span className="mt-2 flex items-center gap-2 text-xs text-ink-placeholder">
          {draft.complete && (
            <span className="inline-flex items-center gap-1 rounded-full bg-priority-optional-bg px-2 py-0.5 font-medium text-priority-optional">
              <CheckCircle2 className="h-3 w-3" aria-hidden />
              {t("resume.list.ready")}
            </span>
          )}
          <span>
            {t("resume.list.updated", {
              time: formatRelativeTime(draft.updatedAt),
            })}
          </span>
        </span>
      </button>
      <div className="absolute end-2 top-2">
        <DropdownMenu
          ariaLabel={t("resume.list.actions")}
          align="end"
          items={[
            {
              key: "rename",
              label: t("resume.list.rename"),
              icon: <Pencil className="h-4 w-4" aria-hidden />,
              onSelect: onRename,
            },
            {
              key: "duplicate",
              label: t("resume.list.duplicate"),
              icon: <Copy className="h-4 w-4" aria-hidden />,
              onSelect: onDuplicate,
            },
            {
              key: "delete",
              label: t("resume.list.delete"),
              icon: <Trash2 className="h-4 w-4" aria-hidden />,
              onSelect: onDelete,
              destructive: true,
            },
          ]}
        />
      </div>
    </li>
  );
}

function EmptyState({
  onCreate,
  creating,
}: {
  onCreate: () => void;
  creating: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border-card px-6 py-16 text-center">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary-bg text-primary">
        <FileText className="h-7 w-7" aria-hidden />
      </span>
      <h2 className="text-base font-semibold text-ink-secondary">
        {t("resume.list.emptyTitle")}
      </h2>
      <p className="mt-1 max-w-xs text-sm text-ink-muted">
        {t("resume.list.emptyBody")}
      </p>
      <button
        type="button"
        onClick={onCreate}
        disabled={creating}
        className="mt-5 flex cursor-pointer items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
      >
        <Plus className="h-4 w-4" aria-hidden />
        {t("resume.list.createFirst")}
      </button>
    </div>
  );
}

function RenameDialog({
  initialTitle,
  busy,
  onSave,
  onCancel,
}: {
  initialTitle: string;
  busy: boolean;
  onSave: (title: string) => void;
  onCancel: () => void;
}) {
  const { t } = useTranslation();
  const [value, setValue] = useState(initialTitle);
  return (
    <ModalShell
      open
      title={t("resume.list.renameTitle")}
      busy={busy}
      onClose={onCancel}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(value);
        }}
      >
        <input
          value={value}
          onChange={(e) => setValue(e.target.value)}
          maxLength={120}
          aria-label={t("resume.list.renameLabel")}
          className="w-full rounded-lg border border-border bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-primary"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="cursor-pointer rounded-full px-4 py-2 text-sm font-medium text-ink-muted transition-colors hover:bg-surface-gray"
          >
            {t("resume.list.cancel")}
          </button>
          <button
            type="submit"
            disabled={busy}
            className="cursor-pointer rounded-full bg-primary px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {t("resume.list.save")}
          </button>
        </div>
      </form>
    </ModalShell>
  );
}
