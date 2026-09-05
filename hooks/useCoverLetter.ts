import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import * as coverLetter from "@/services/coverLetter";
import {
  getDraft as getResumeDraft,
  listDrafts as listResumeDrafts,
} from "@/services/resume";
import { buildResumeContext } from "@/lib/coverLetter/schema";
import type { CoverLetterUpdater } from "@/lib/coverLetter/editOps";
import { CURRENT_USER_KEY } from "@/hooks/useProfile";
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  isSupportedLanguage,
  type SupportedLanguage,
} from "@/lib/i18n/config";
import type { UserProfile } from "@/types";
import type {
  CoverLetterChatMessage,
  CoverLetterData,
  CoverLetterDraft,
  CoverLetterProfileContext,
} from "@/types/coverLetter";
import type { ResumeJobPosting } from "@/types/resume";

/** React Query hooks for the AI Cover-Letter Generator. Mirrors useResume.ts:
 *  stable keys, optimistic send, onSuccess invalidation. */

const DRAFTS_KEY = ["cover-letter-drafts"] as const;
const USAGE_KEY = ["cover-letter-usage"] as const;

export function draftKey(id: string) {
  return ["cover-letter-draft", id] as const;
}

function resolveLanguage(lang: string): SupportedLanguage {
  return isSupportedLanguage(lang) ? lang : DEFAULT_LANGUAGE;
}

function buildProfile(
  user: UserProfile | undefined,
  language: string,
): CoverLetterProfileContext {
  const onb = user?.onboarding ?? null;
  return {
    firstName: onb?.firstName ?? null,
    persona: onb?.persona ?? null,
    stage: onb?.stage ?? null,
    city: onb?.city ?? null,
    province: onb?.province ?? null,
    email: null,
    responseLanguage: resolveLanguage(language),
  };
}

function nowIso() {
  return new Date().toISOString();
}

/** Today's date for the letter's date line. Always English ("September 4, 2026")
 *  regardless of UI language — the letter itself is English for Canadian employers. */
function formatToday(): string {
  return new Date().toLocaleDateString("en-CA", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

export function useCoverLetterDrafts() {
  return useQuery({ queryKey: DRAFTS_KEY, queryFn: coverLetter.listDrafts });
}

export function useCoverLetterDraft(id: string | null) {
  return useQuery({
    queryKey: draftKey(id ?? ""),
    queryFn: () => coverLetter.getDraft(id as string),
    enabled: !!id,
    staleTime: 30_000,
  });
}

export function useCoverLetterUsage() {
  return useQuery({
    queryKey: USAGE_KEY,
    queryFn: coverLetter.getCoverLetterUsage,
  });
}

interface FetchJobPostingInput {
  draftId: string;
  source: { url: string } | { text: string };
}

/** Fetch + extract a target job posting (or accept pasted text) and attach it to
 *  the letter. Errors (JobPostingError / CoverLetterLimitError) propagate. */
export function useFetchJobPosting() {
  const queryClient = useQueryClient();
  return useMutation<CoverLetterDraft, Error, FetchJobPostingInput>({
    mutationFn: async ({ draftId, source }) => {
      const jobPosting: ResumeJobPosting =
        await coverLetter.fetchJobPosting(source);
      return coverLetter.setDraftJobPosting(draftId, jobPosting);
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

/** Remove the target job posting from a letter. */
export function useClearJobPosting() {
  const queryClient = useQueryClient();
  return useMutation<CoverLetterDraft, Error, string>({
    mutationFn: (draftId) => coverLetter.setDraftJobPosting(draftId, null),
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

interface SetResumeLinkInput {
  draftId: string;
  resumeDraftId: string | null;
}

/** Link (or unlink) a resume draft as context for the letter. */
export function useSetResumeLink() {
  const queryClient = useQueryClient();
  return useMutation<CoverLetterDraft, Error, SetResumeLinkInput>({
    mutationFn: ({ draftId, resumeDraftId }) =>
      coverLetter.setDraftResumeLink(draftId, resumeDraftId),
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

/**
 * Create a new letter: prefill the sender from the onboarding profile, seed the
 * date + signature, auto-link the user's most recent resume (if any) as context,
 * and seed a localized opening message + chips — warm + instant, no model call.
 */
export function useCreateCoverLetterDraft() {
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  return useMutation({
    mutationFn: async () => {
      const user = queryClient.getQueryData<UserProfile>(CURRENT_USER_KEY);
      const onb = user?.onboarding ?? null;
      const name = onb?.firstName?.trim() ?? "";
      const location = [onb?.city, onb?.province].filter(Boolean).join(", ");

      // Auto-link the most recent resume as context, if the user has one.
      let resumeDraftId: string | undefined;
      try {
        const resumes = await listResumeDrafts();
        resumeDraftId = resumes[0]?.id;
      } catch {
        // no resume / unavailable — the letter just starts without context.
      }

      const opener: CoverLetterChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: name
          ? t("coverLetter.opener.greetingNamed", { name })
          : t("coverLetter.opener.greeting"),
        suggestions: [
          t("coverLetter.opener.suggestion1"),
          t("coverLetter.opener.suggestion2"),
          t("coverLetter.opener.suggestion3"),
        ],
        createdAt: nowIso(),
      };
      const title = t("coverLetter.untitled");
      const draft = coverLetter.newDraft({
        title,
        contact: { name, location },
        date: formatToday(),
        signature: name,
        resumeDraftId,
        openerMessage: opener,
      });
      return coverLetter.saveDraft(draft);
    },
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

/** A short human title derived from the letter's target so the list stays
 *  scannable. */
function deriveTitle(data: CoverLetterData, fallback: string): string {
  const company = data.jobPosting?.company?.trim() || data.recipient.company.trim();
  const role = data.jobPosting?.title?.trim();
  if (role && company) return `${role} — ${company}`;
  if (role) return role;
  if (company) return company;
  return fallback;
}

/**
 * True while a letter's title is still auto-managed (not manually renamed).
 * Compared against the auto-title computed with the creation-default placeholder
 * in EVERY supported locale (a target-less letter stores its default in whatever
 * locale was active at creation). Mirrors the resume isAutoTitle logic.
 */
function isAutoTitle(
  title: string,
  data: CoverLetterData,
  placeholders: string[],
): boolean {
  return placeholders.some((p) => title === deriveTitle(data, p));
}

let editWriteChain: Promise<unknown> = Promise.resolve();

interface SendInput {
  draftId: string;
  /** Shown as the user's chat bubble. */
  text: string;
  /** What's actually sent to the model (defaults to `text`). */
  modelPrompt?: string;
}

/**
 * Persist the user turn, ask the model (via /api/cover-letter) for the structured
 * next turn, then persist the assistant reply + the updated letter snapshot. The
 * linked resume is loaded and framed as context each turn; the job-posting target
 * (never model-authored) + resume link are re-merged onto the returned snapshot.
 */
export function useSendCoverLetterMessage() {
  const queryClient = useQueryClient();
  const { t, i18n } = useTranslation();
  return useMutation<
    CoverLetterDraft,
    Error,
    SendInput,
    { key: ReturnType<typeof draftKey> }
  >({
    mutationFn: async ({ draftId, text, modelPrompt }) => {
      await editWriteChain;
      const draft = await coverLetter.getDraft(draftId);
      if (!draft) throw new Error("Cover letter not found");

      const user = queryClient.getQueryData<UserProfile>(CURRENT_USER_KEY);
      const profile = buildProfile(user, i18n.language);

      const userMessage: CoverLetterChatMessage = {
        id: crypto.randomUUID(),
        role: "user",
        content: text,
        createdAt: nowIso(),
      };
      const withUser: CoverLetterDraft = {
        ...draft,
        messages: [...draft.messages, userMessage],
      };
      // Persist the user turn first so it survives a failed generation.
      await coverLetter.saveDraft(withUser);
      queryClient.setQueryData(draftKey(draftId), withUser);

      // Build reference context from the linked resume (if any).
      let resumeContext = "";
      if (draft.coverLetter.resumeDraftId) {
        try {
          const resumeDraft = await getResumeDraft(
            draft.coverLetter.resumeDraftId,
          );
          resumeContext = buildResumeContext(resumeDraft?.resume ?? null);
        } catch {
          // resume unavailable (deleted / RLS) — proceed without context.
        }
      }
      const job = draft.coverLetter.jobPosting;
      const jobPosting = job
        ? { title: job.title, company: job.company, text: job.text }
        : null;

      const response = await coverLetter.generateCoverLetterTurn({
        history: draft.messages,
        message: modelPrompt ?? text,
        currentCoverLetter: draft.coverLetter,
        resumeContext,
        jobPosting,
        todayDate: draft.coverLetter.date || formatToday(),
        profile,
      });

      const assistantMessage: CoverLetterChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: response.reply,
        suggestions: response.suggestions,
        createdAt: nowIso(),
      };

      const placeholders = Object.keys(SUPPORTED_LANGUAGES).map((lng) =>
        t("coverLetter.untitled", { lng }),
      );
      const latestTitle =
        queryClient.getQueryData<CoverLetterDraft>(draftKey(draftId))?.title ??
        draft.title;

      // The model never authors the job-posting target or resume link and the
      // edge fn strips unknown fields, so re-merge the client-owned metadata.
      const mergedLetter: CoverLetterData = { ...response.coverLetter };
      if (draft.coverLetter.jobPosting)
        mergedLetter.jobPosting = draft.coverLetter.jobPosting;
      if (draft.coverLetter.resumeDraftId)
        mergedLetter.resumeDraftId = draft.coverLetter.resumeDraftId;

      const finalDraft: CoverLetterDraft = {
        ...withUser,
        messages: [...withUser.messages, assistantMessage],
        coverLetter: mergedLetter,
        complete: response.complete,
        title: isAutoTitle(latestTitle, draft.coverLetter, placeholders)
          ? deriveTitle(mergedLetter, latestTitle)
          : latestTitle,
      };
      return coverLetter.saveDraft(finalDraft);
    },
    onMutate: async ({ draftId, text }) => {
      const key = draftKey(draftId);
      await queryClient.cancelQueries({ queryKey: key });
      const optimistic: CoverLetterChatMessage = {
        id: `optimistic-${Date.now()}`,
        role: "user",
        content: text,
        createdAt: nowIso(),
      };
      queryClient.setQueryData<CoverLetterDraft>(key, (prev) =>
        prev ? { ...prev, messages: [...prev.messages, optimistic] } : prev,
      );
      return { key };
    },
    onError: (_err, _vars, context) => {
      if (context) queryClient.invalidateQueries({ queryKey: context.key });
    },
    onSuccess: (finalDraft) => {
      queryClient.setQueryData(draftKey(finalDraft.id), finalDraft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
      queryClient.invalidateQueries({ queryKey: USAGE_KEY });
    },
  });
}

interface UpdateLetterInput {
  draftId: string;
  update: CoverLetterUpdater;
}

/**
 * Persist a manual inline edit to the letter. Writes the SAME `draft.coverLetter`
 * the AI turn reads/writes, so chat-driven and manual edits stay in sync. Same
 * correctness model as useUpdateResumeData: `onMutate` folds the update into the
 * cache synchronously, and persistence is serialized + reads the live cache.
 */
export function useUpdateCoverLetterData() {
  const queryClient = useQueryClient();
  return useMutation<
    CoverLetterDraft,
    Error,
    UpdateLetterInput,
    { key: ReturnType<typeof draftKey> }
  >({
    mutationFn: ({ draftId }) => {
      const run = editWriteChain.then(() => {
        const cached = queryClient.getQueryData<CoverLetterDraft>(
          draftKey(draftId),
        );
        if (!cached) throw new Error("Cover letter not found");
        return coverLetter.saveDraftCoverLetter(
          draftId,
          cached.coverLetter,
          cached.title,
        );
      });
      editWriteChain = run.catch(() => {});
      return run;
    },
    onMutate: async ({ draftId, update }) => {
      const key = draftKey(draftId);
      await queryClient.cancelQueries({ queryKey: key });
      queryClient.setQueryData<CoverLetterDraft>(key, (prev) =>
        prev ? { ...prev, coverLetter: update(prev.coverLetter) } : prev,
      );
      return { key };
    },
    onError: (_err, _vars, context) => {
      if (context?.key) {
        queryClient.invalidateQueries({ queryKey: context.key });
      }
    },
    onSuccess: (finalDraft) => {
      queryClient.setQueryData<CoverLetterDraft>(
        draftKey(finalDraft.id),
        (prev) =>
          prev
            ? { ...prev, title: finalDraft.title, updatedAt: finalDraft.updatedAt }
            : finalDraft,
      );
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

export function useDeleteCoverLetterDraft() {
  const queryClient = useQueryClient();
  return useMutation<void, Error, string>({
    mutationFn: (id) => coverLetter.deleteDraft(id),
    onSuccess: (_data, id) => {
      queryClient.removeQueries({ queryKey: draftKey(id) });
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

interface RenameInput {
  id: string;
  title: string;
}

export function useRenameCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation<CoverLetterDraft, Error, RenameInput>({
    mutationFn: ({ id, title }) => coverLetter.renameDraft(id, title),
    onSuccess: (draft) => {
      queryClient.setQueryData<CoverLetterDraft>(draftKey(draft.id), (prev) =>
        prev
          ? { ...prev, title: draft.title, updatedAt: draft.updatedAt }
          : draft,
      );
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}

interface DuplicateInput {
  id: string;
  title: string;
}

export function useDuplicateCoverLetter() {
  const queryClient = useQueryClient();
  return useMutation<CoverLetterDraft, Error, DuplicateInput>({
    mutationFn: ({ id, title }) => coverLetter.duplicateDraft(id, title),
    onSuccess: (draft) => {
      queryClient.setQueryData(draftKey(draft.id), draft);
      queryClient.invalidateQueries({ queryKey: DRAFTS_KEY });
    },
  });
}
